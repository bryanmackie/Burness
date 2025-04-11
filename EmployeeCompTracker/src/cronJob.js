import cron from 'node-cron';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

console.log('Cron job script initialized.');

// Set up NodeMailer transporter using Gmail
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Function to get the email template from the database
async function getEmailTemplate(client, templateType) {
  try {
    const result = await client.query(
      `SELECT subject, body FROM email_templates WHERE template_type = $1 LIMIT 1`,
      [templateType]
    );
    if (result.rows.length > 0) {
      console.log("Email template fetched:", result.rows[0]);
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

// Function to calculate the last payroll date
function getLastPayrollDate(latestSalaryDate) {
  const salaryDate = new Date(latestSalaryDate);
  const year = salaryDate.getFullYear() + 1; // Add 1 to the year
  const month = salaryDate.getMonth(); 
  let lastPayrollDate;

  if (salaryDate.getDate() <= 15) {
    lastPayrollDate = new Date(year, month, 1);
  } else {
    lastPayrollDate = new Date(year, month, 16);
  }
  return lastPayrollDate.toISOString().split('T')[0]; // Format as YYYY-MM-DD
}

// Function to send an email with CC's set as a comma-delimited string
async function sendEmail(to, cc, subject, html) {
  try {
    const mailOptions = {
      from: `"HR Notification" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
      cc // can be a string of comma-separated emails or an array
    };
    console.log("Attempting to send email with options:", mailOptions);
    let info = await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${to} (cc: ${cc || "none"}). Message ID: ${info.messageId}`);
  } catch (error) {
    console.error(`Error sending email to ${to}:`, error);
  }
}

// Main function to check the database and send notifications
async function checkAndNotify(client) {
  try {
    // Fetch the email template from the database
    const emailTemplate = await getEmailTemplate(client, "salary_notification");
    if (!emailTemplate) {
      console.error("Email template not found. Aborting notifications.");
      return;
    }

    // Query for employees eligible for a raise
    const employeeQuery = `
      SELECT led.first_name, led.last_name, led.latest_salary_effective_date
      FROM latest_employee_data led
      JOIN salary_review_data sr ON led.first_name = sr.first_name AND led.last_name = sr.last_name
      WHERE led.latest_salary_effective_date < (CURRENT_DATE - INTERVAL '46 weeks')
        AND sr.raise_eligible = TRUE
    `;
    const employeeResult = await client.query(employeeQuery);
    const employees = employeeResult.rows;
    console.log(`Found ${employees.length} employee(s) meeting the criteria.`);

    // Process each employee
    for (const emp of employees) {
      const { first_name, last_name, latest_salary_effective_date } = emp;
      const payrollIncreaseDate = getLastPayrollDate(latest_salary_effective_date);

      // Get immediate supervisor details (remains unchanged)
      const immediateSupervisorQuery = `
        SELECT s.sup_first_name, s.sup_last_name, sr2.email AS immediate_supervisor_email
        FROM supervisors s
        JOIN salary_review_data sr2 ON s.sup_first_name = sr2.first_name AND s.sup_last_name = sr2.last_name
        WHERE s.emp_first_name = $1 AND s.emp_last_name = $2
        LIMIT 1
      `;
      const immediateResult = await client.query(immediateSupervisorQuery, [first_name, last_name]);
      if (immediateResult.rows.length === 0) {
        console.warn(`No immediate supervisor found for ${first_name} ${last_name}`);
        continue;
      }
      const immediateSupervisor = immediateResult.rows[0];

      // Get employee info from emailaid to fetch division and direct supervisor info
      const employeeInfoQuery = `
        SELECT division, direct_first_name, direct_last_name
        FROM emailaid
        WHERE first_name = $1 AND last_name = $2
        LIMIT 1
      `;
      const employeeInfoResult = await client.query(employeeInfoQuery, [first_name, last_name]);
      if (employeeInfoResult.rows.length === 0) {
        console.warn(`No additional info found in emailaid for ${first_name} ${last_name}`);
        continue;
      }
      const { division, direct_first_name, direct_last_name } = employeeInfoResult.rows[0];

      // Query for division lead emails using the logic:
      // A division lead is in the same division and has both direct_first_name and direct_last_name as null.
      const divisionLeadsQuery = `
        SELECT sr.email
        FROM salary_review_data sr
        JOIN emailaid e ON sr.first_name = e.first_name AND sr.last_name = e.last_name
        WHERE e.division = $1
          AND e.direct_first_name IS NULL
          AND e.direct_last_name IS NULL
      `;
      const divisionLeadsResult = await client.query(divisionLeadsQuery, [division]);
      const divisionLeadEmails = divisionLeadsResult.rows.map(row => row.email);

      // Always include the fixed email address
     // divisionLeadEmails.push("vbigelow@burness.com"); //vbigelow@burness.com
      divisionLeadEmails.push("bryanmackie7@gmail.com");
      // Build final CC list as a comma-separated string and remove duplicates
      const ccList = [...new Set(divisionLeadEmails)].join(',');

      // Replace placeholders in the email template subject and body
      // ultimate_supervisor_name now comes from direct_first_name and direct_last_name of the employeeInfo
      const subject = emailTemplate.subject
        .replace("{first_name}", first_name)
        .replace("{last_name}", last_name);

      const emailBody = emailTemplate.body
        .replace("{first_name}", first_name)
        .replace("{last_name}", last_name)
        .replace("{payroll_increase_date}", payrollIncreaseDate)
        .replace(/{ultimate_supervisor_name}/g, `${direct_first_name}`)
        .replace("{immediate_supervisor_name}", `${immediateSupervisor.sup_first_name}`);

      // Send the email (immediate supervisor in "to"; CC includes division leads and vbigelow)
      await sendEmail(immediateSupervisor.immediate_supervisor_email, ccList, subject, emailBody);
      console.log(`Notified supervisors for ${first_name} ${last_name}`);
    }
  } catch (error) {
    console.error("Error in checkAndNotify:", error);
  }
}

// Schedule the cron job to run weekly (every Monday at 8 AM)
export function startCronJob(client) {
  try {
    // For testing purposes, you can uncomment the following to run immediately.
     checkAndNotify(client);

    cron.schedule("0 8 * * MON", () => {
      console.log("Cron job triggered: Running weekly salary check and notification job...");
      checkAndNotify(client);
    }, {
      timezone: "America/New_York"
    });

    console.log("Cron job scheduled successfully.");
  } catch (error) {
    console.error("Error scheduling cron job:", error);
  }
}