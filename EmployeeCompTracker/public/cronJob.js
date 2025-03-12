// cronJob.js

require('dotenv').config();
const cron = require("node-cron");
const { Pool } = require("pg");
const nodemailer = require("nodemailer");

// Set up PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Set up NodeMailer transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Function to get the email template from the database
async function getEmailTemplate(templateType) {
  try {
    const result = await pool.query(
      `SELECT subject, body FROM email_templates WHERE template_type = $1 LIMIT 1`,
      [templateType]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    console.error("Error fetching email template:", error);
    return null;
  }
}

// Function to calculate the next payroll date (1st or 16th of the next month)
function getNextPayrollDate(latestSalaryDate) {
  let salaryDate = new Date(latestSalaryDate);
  let year = salaryDate.getFullYear();
  let month = salaryDate.getMonth() + 1; // Start with the same month
  let nextPayrollDate;

  if (salaryDate.getDate() < 16) {
    nextPayrollDate = new Date(year, month - 1, 16);
  } else {
    nextPayrollDate = new Date(year, month, 1);
  }

  return nextPayrollDate.toISOString().split('T')[0]; // Format as YYYY-MM-DD
}

// Function to send an email
async function sendEmail(to, cc, subject, text) {
  try {
    let info = await transporter.sendMail({
      from: `"HR Notification" <${process.env.EMAIL_USER}>`,
      to,
      cc,
      subject,
      text,
    });
    console.log(`Email sent to ${to} (cc: ${cc || "N/A"}). Message ID: ${info.messageId}`);
  } catch (error) {
    console.error(`Error sending email to ${to}:`, error);
  }
}

// Function to check the database and send notifications
async function checkAndNotify() {
  try {
    // Get the email template
    const emailTemplate = await getEmailTemplate("salary_notification");
    if (!emailTemplate) {
      console.error("Email template not found. Skipping notifications.");
      return;
    }

    // Query employees who are eligible for a raise
    const employeeQuery = `
      SELECT led.first_name, led.last_name, led.latest_salary_effective_date
      FROM latest_employee_data led
      JOIN salary_review_data sr ON led.first_name = sr.first_name AND led.last_name = sr.last_name
      WHERE led.latest_salary_effective_date < (CURRENT_DATE - INTERVAL '10 months')
        AND sr.raise_eligible = TRUE
    `;
    const employeeResult = await pool.query(employeeQuery);
    const employees = employeeResult.rows;
    console.log(`Found ${employees.length} employee(s) meeting the criteria.`);

    // Process each employee
    for (const emp of employees) {
      const { first_name, last_name, latest_salary_effective_date } = emp;
      const payrollIncreaseDate = getNextPayrollDate(latest_salary_effective_date);

      // Get immediate supervisor details
      const immediateSupervisorQuery = `
        SELECT s.sup_first_name, s.sup_last_name, sr2.email AS immediate_supervisor_email
        FROM supervisors s
        JOIN salary_review_data sr2 ON s.sup_first_name = sr2.first_name AND s.sup_last_name = sr2.last_name
        WHERE s.emp_first_name = $1 AND s.emp_last_name = $2
        LIMIT 1
      `;
      const immediateResult = await pool.query(immediateSupervisorQuery, [first_name, last_name]);
      if (immediateResult.rows.length === 0) continue;
      const immediateSupervisor = immediateResult.rows[0];

      // Get ultimate supervisor details
      const ultimateNameQuery = `
        SELECT ultimate_supervisor_first_name, ultimate_supervisor_last_name
        FROM salary_review_data
        WHERE first_name = $1 AND last_name = $2
        LIMIT 1
      `;
      const ultimateNameResult = await pool.query(ultimateNameQuery, [first_name, last_name]);
      if (ultimateNameResult.rows.length === 0) continue;
      const { ultimate_supervisor_first_name, ultimate_supervisor_last_name } = ultimateNameResult.rows[0];

      // Get ultimate supervisor email
      const ultimateEmailQuery = `
        SELECT email AS ultimate_supervisor_email
        FROM salary_review_data
        WHERE first_name = $1 AND last_name = $2
        LIMIT 1
      `;
      const ultimateEmailResult = await pool.query(ultimateEmailQuery, [ultimate_supervisor_first_name, ultimate_supervisor_last_name]);
      if (ultimateEmailResult.rows.length === 0) continue;
      const ultimateSupervisor = ultimateEmailResult.rows[0];

      // Determine email recipients
      let to = immediateSupervisor.immediate_supervisor_email;
      let cc = immediateSupervisor.immediate_supervisor_email === ultimateSupervisor.ultimate_supervisor_email ? null : ultimateSupervisor.ultimate_supervisor_email;

      // Replace placeholders in the email template
      const subject = emailTemplate.subject.replace("{first_name}", first_name).replace("{last_name}", last_name);

      const emailBody = emailTemplate.body
        .replace("{first_name}", first_name)
        .replace("{payroll_increase_date}", payrollIncreaseDate)
        .replace("{ultimate_supervisor_name}", `${ultimate_supervisor_first_name} ${ultimate_supervisor_last_name}`);

      // Send email
      await sendEmail(to, cc, subject, emailBody);
      console.log(`Notified supervisors for ${first_name} ${last_name}`);
    }
  } catch (error) {
    console.error("Error in checkAndNotify:", error);
  }
}

// Schedule the cron job to run weekly (every Monday at 8 AM)
cron.schedule("0 8 * * MON", () => {
  console.log("Running weekly salary check and notification job...");
  checkAndNotify();
});

// Optionally, invoke the function immediately for testing
checkAndNotify();
