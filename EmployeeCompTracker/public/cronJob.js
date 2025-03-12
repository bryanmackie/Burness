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
    if (result.rows.length > 0) {
      return result.rows[0];
    } else {
      console.error(`No email template found for type: ${templateType}`);
      return null;
    }
  } catch (error) {
    console.error("Error fetching email template:", error);
    return null;
  }
}

// Function to send an email
async function sendEmail(to, subject, text) {
  try {
    let info = await transporter.sendMail({
      from: `"HR Notification" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
    });
    console.log(`Email sent to ${to}. Message ID: ${info.messageId}`);
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
      SELECT led.first_name, led.last_name, led.latest_salary_effective_date,
             (CURRENT_DATE - led.latest_salary_effective_date) AS days_since_salary_change
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
      const { first_name, last_name, latest_salary_effective_date, days_since_salary_change } = emp;

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

      // Replace placeholders in the email template
      const subject = emailTemplate.subject.replace("{first_name}", first_name).replace("{last_name}", last_name);

      const emailBody = emailTemplate.body
        .replace("{first_name}", first_name)
        .replace("{last_name}", last_name)
        .replace("{latest_salary_effective_date}", latest_salary_effective_date.toISOString().split('T')[0])
        .replace("{days_since_salary_change}", days_since_salary_change)
        .replace("{immediate_supervisor_name}", `${immediateSupervisor.sup_first_name} ${immediateSupervisor.sup_last_name}`)
        .replace("{immediate_supervisor_email}", immediateSupervisor.immediate_supervisor_email)
        .replace("{ultimate_supervisor_name}", `${ultimate_supervisor_first_name} ${ultimate_supervisor_last_name}`)
        .replace("{ultimate_supervisor_email}", ultimateSupervisor.ultimate_supervisor_email);

      // Send emails to both supervisors
      await sendEmail(immediateSupervisor.immediate_supervisor_email, subject, emailBody);
      await sendEmail(ultimateSupervisor.ultimate_supervisor_email, subject, emailBody);

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
// checkAndNotify();
