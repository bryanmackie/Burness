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
      console.log("Email template fetched:", result.rows[0]); // Log the fetched template
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
// - Any day between the 1st and 15th of the month becomes the 1st of the month.
// - Any day from the 16th to the end of the month becomes the 16th of the month.
// - Add 1 to the year.
function getLastPayrollDate(latestSalaryDate) {
  const salaryDate = new Date(latestSalaryDate);
  const year = salaryDate.getFullYear() + 1; // Add 1 to the year
  const month = salaryDate.getMonth(); // JavaScript Date months are 0-indexed
  let lastPayrollDate;

  if (salaryDate.getDate() <= 15) {
    // Payroll on the 1st of the same month
    lastPayrollDate = new Date(year, month, 1);
  } else {
    // Payroll on the 16th of the same month
    lastPayrollDate = new Date(year, month, 16);
  }
  return lastPayrollDate.toISOString().split('T')[0]; // Format as YYYY-MM-DD
}

// Function to send an email with optional CC
async function sendEmail(to, cc, subject, html) {
  try {
    let mailOptions = {
      from: `"HR Notification" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html, // Use 'html' instead of 'text'
      headers: {
        "Content-Type": "text/html; charset=utf-8", // Explicitly set the content type
      },
    };
    if (cc) {
      mailOptions.cc = cc;
    }
    console.log("Attempting to send email with options:", mailOptions); // Log email options
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

    // Query for employees eligible for a raise:
    // - latest_salary_effective_date is older than 10 months
    // - raise_eligible is true in salary_review_data
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
      
      // Get immediate supervisor details
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

      // Get ultimate supervisor details from salary_review_data
      const ultimateNameQuery = `
        SELECT ultimate_supervisor_first_name, ultimate_supervisor_last_name
        FROM salary_review_data
        WHERE first_name = $1 AND last_name = $2
        LIMIT 1
      `;
      const ultimateNameResult = await client.query(ultimateNameQuery, [first_name, last_name]);
      if (ultimateNameResult.rows.length === 0) {
        console.warn(`No ultimate supervisor info found for ${first_name} ${last_name}`);
        continue;
      }
      const { ultimate_supervisor_first_name, ultimate_supervisor_last_name } = ultimateNameResult.rows[0];

      // Get ultimate supervisor email
      const ultimateEmailQuery = `
        SELECT email AS ultimate_supervisor_email
        FROM salary_review_data
        WHERE first_name = $1 AND last_name = $2
        LIMIT 1
      `;
      const ultimateEmailResult = await client.query(ultimateEmailQuery, [ultimate_supervisor_first_name, ultimate_supervisor_last_name]);
      if (ultimateEmailResult.rows.length === 0) {
        console.warn(`No email found for ultimate supervisor ${ultimate_supervisor_first_name} ${ultimate_supervisor_last_name}`);
        continue;
      }
      const ultimateSupervisor = ultimateEmailResult.rows[0];

      // Determine email recipients:
      // If immediate and ultimate supervisor emails are the same, do not set CC.
      const to = immediateSupervisor.immediate_supervisor_email;
      const cc = (to === ultimateSupervisor.ultimate_supervisor_email) ? null : ultimateSupervisor.ultimate_supervisor_email;

      // Replace placeholders in the email template subject and body
      const subject = emailTemplate.subject
        .replace("{first_name}", first_name)
        .replace("{last_name}", last_name);

        const emailBody = emailTemplate.body
        .replace("{first_name}", first_name)
        .replace("{last_name}", last_name)
        .replace("{payroll_increase_date}", payrollIncreaseDate)
        .replace("{ultimate_supervisor_name}", `${ultimate_supervisor_first_name} ${ultimate_supervisor_last_name}`)
        .replace("{immediate_supervisor_name}", `${immediateSupervisor.sup_first_name} ${immediateSupervisor.sup_last_name}`)

      // Send the email (immediate supervisor in "to", ultimate supervisor in "cc" if different)
      await sendEmail(to, cc, subject, emailBody);
      console.log(`Notified supervisors for ${first_name} ${last_name}`);
    }
  } catch (error) {
    console.error("Error in checkAndNotify:", error);
  }
}

// Schedule the cron job to run weekly (every Monday at 8 AM)
export function startCronJob(client) {
  try {
    // For testing purposes, run the function immediately.
    //checkAndNotify(client);

    cron.schedule("0 8 * * MON", () => {
      console.log("Cron job triggered: Running weekly salary check and notification job...");
      checkAndNotify(client);
    }, {
      timezone: "America/New_York" // Set your desired time zone
    });

    console.log("Cron job scheduled successfully.");
  } catch (error) {
    console.error("Error scheduling cron job:", error);
  }
}