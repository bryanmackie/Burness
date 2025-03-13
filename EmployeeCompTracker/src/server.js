import express from 'express';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import createConnection from './config/db.js'; // Import the database connection
import dotenv from 'dotenv';
dotenv.config();

import { startCronJob } from './cronJob.js';



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Serve static files from the "public" folder
app.use(express.static(path.join(__dirname, '../public')));


app.use('/node_modules', express.static(path.join(__dirname, '../node_modules')));

// Parse JSON request bodies
app.use(bodyParser.json());

const validPassphrase = process.env.validPassphrase;
const validPassphraseAdmin = process.env.validPassphraseAdmin;

let client;

// Helper function to handle database errors
const handleDatabaseError = (res, error) => {
  console.error('Database error:', error);
  res.status(500).json({ success: false, message: 'Internal server error.' });
};

const sanitizeNumber = (value) => {
  if (value === "" || value === null || value === undefined) {
    return null;  // Replace empty string or null/undefined with NULL
  }
  const parsedValue = parseFloat(value);
  return !Number.isNaN(parsedValue) ? parsedValue : null;  // If it's a valid number, return it, else NULL
};
// Endpoint to verify the passphrase

function buildHierarchy(data) {
  const map = {};
  const roots = [];

  // Step 1: Create a map of employees and their subordinates (children)
  data.forEach(item => {
    const employee = {
      emp_first_name: item.emp_first_name,
      emp_last_name: item.emp_last_name,
      emp_id: item.emp_id,  // Use emp_id directly
      sup_id: item.sup_id,  // Use sup_id directly
      sup_first_name: item.sup_first_name,
      sup_last_name: item.sup_last_name,
      children: []  // Initialize an empty array for children (subordinates)
    };

    // Add employee to the map by their emp_id
    map[item.emp_id] = employee;

    // If the employee has no supervisor (sup_id is null), they are a top-level employee
    if (item.sup_id === null) {
      roots.push(employee);  // Add to roots (top-level employees with no supervisor)
    }
  });

  // Step 2: Link employees to their supervisors (adding children)
  data.forEach(item => {
    if (item.sup_id !== null) {
      const employee = map[item.emp_id];
      const supervisor = map[item.sup_id];

      if (supervisor) {
        supervisor.children.push(employee);  // Add employee as a child of their supervisor
      }
    }
  });

  // Debugging output to log the hierarchy structure
  console.log("Final Hierarchy:", JSON.stringify(roots, null, 2));
  return roots;  // Return the hierarchical structure (top-level employees)
}

// Endpoint to fetch hierarchy data after password verification
app.get('/get-hierarchy', async (req, res) => {
  try {
    const result = await client.query('SELECT emp_first_name, emp_last_name, emp_id, sup_id, sup_first_name, sup_last_name FROM supervisors ORDER BY sup_id, emp_id;');
    //console.log('Raw Data from Database:', result.rows);  // Log to check if data is correct
    const employees = result.rows;
    const hierarchy = buildHierarchy(employees);  // Build the hierarchy from the employees data
    res.json(hierarchy);  // Send the hierarchy as a JSON response
  } catch (err) {
    console.error('Error fetching hierarchy:', err);
    res.status(500).send('Error fetching data');
  }
});

app.post('/verify-passphrase', async (req, res) => {
  const { passphrase } = req.body;

  let role = '';
  let employeesQuery = '';

  // Validate the passphrase and assign role
  if (passphrase === validPassphrase) {
    role = 'manager';
    employeesQuery = 'SELECT first_name, last_name FROM employee_salary WHERE access_status != $1 ORDER BY last_name ASC';
  } else if (passphrase === validPassphraseAdmin) {
    role = 'admin';
    employeesQuery = 'SELECT first_name, last_name FROM employee_salary ORDER BY last_name ASC';  // No parameters needed
  } else {
    return res.status(403).json({ success: false, message: 'Incorrect passphrase. Access denied.' });
  }

  // Once role is assigned, fetch employee data based on the passphrase (role)
  try {
    client = await createConnection();
    console.log('Database connected successfully.');

    
    // If the query requires parameters (for 'manager' role), pass them
    const result = role === 'admin'
      ? await client.query(employeesQuery) // No parameters for admin
      : await client.query(employeesQuery, ['restricted']); // 'restricted' for manager

    res.status(200).json({
      success: true,
      role: role,
      employees: result.rows
    });
  } catch (error) {
    handleDatabaseError(res, error);
  }
});

// Initialize the database connection and start the server
const startServer = async () => {
  try {
    client = await createConnection();  // Create the database connection
    console.log('Database connected successfully.');

    // Routes

    startCronJob(client);

    // Update employee compensation
    app.post('/update', async (req, res) => {
      const {
        m_first, first_name, last_name, primaryTitle, secondaryTitle, salary,
        salary_effective_date, salarychangereason, comment_logged, comment_date, bonus, bonus_year, raisePercentage
      } = req.body;

      // Validate required fields
      if (!m_first || !first_name || !last_name) {
        return res.status(400).json({ success: false, message: 'Manager first name, First name, and Last name are required.' });
      }
      const sanitizedSalary = sanitizeNumber(salary);
      const sanitizedRaise = sanitizeNumber(raisePercentage);
      const sanitizedBonus = sanitizeNumber(bonus);
      const sanitizedBonusYear = sanitizeNumber(bonus_year);
      const sanitizedSalaryEffectiveDate = salary_effective_date === "" ? null : salary_effective_date;
      const sanitizedCommentDate = comment_date === "" ? null : comment_date;
      try {
        // Construct the SET clause dynamically, only including non-null fields
        const setClause = [];
        const setValues = [];
        const currentSalaryQuery = `
      SELECT latest_salary
      FROM latest_employee_data
      WHERE first_name = $1 AND last_name = $2;
    `;
    const currentSalaryResult = await client.query(currentSalaryQuery, [first_name, last_name]);

    if (currentSalaryResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Employee not found in latest_employee_data.' });
    }

    const currentSalary = currentSalaryResult.rows[0].salary;
    let newSalary = currentSalary;
    if (sanitizedRaise !== null) {
      const raiseDecimal = parseFloat(sanitizedRaise) / 100;
      newSalary = currentSalary * (1 + raiseDecimal);
    } else if (sanitizedSalary !== null) {
      // Use the provided salary if raisePercentage is not provided
      newSalary = sanitizedSalary;
    }
        if (sanitizedSalary !== null || sanitizedRaise !== null) {
          setClause.push(`salary = $${setValues.length + 1}`);
          setValues.push(sanitizedSalary);
        }
        if (sanitizedSalaryEffectiveDate !== null) {
          setClause.push(`salary_effective_date = $${setValues.length + 1}`);
          setValues.push(sanitizedSalaryEffectiveDate);
        }
        if (sanitizedSalaryEffectiveDate !== null) {
          setClause.push(`salarychangereason = $${setValues.length + 1}`);
          setValues.push(salarychangereason);
        }
        if (comment_logged !== null) {
          setClause.push(`comment_logged = $${setValues.length + 1}`);
          setValues.push(comment_logged);
        }
        if (sanitizedCommentDate !== null) {
          setClause.push(`comment_date = $${setValues.length + 1}`);
          setValues.push(sanitizedCommentDate);
        }
        if (sanitizedBonus !== null) {
          setClause.push(`bonus = $${setValues.length + 1}`);
          setValues.push(sanitizedBonus);
        }
        if (sanitizedBonusYear !== null) {
          setClause.push(`bonus_year = $${setValues.length + 1}`);
          setValues.push(sanitizedBonusYear);
        }
        if (primaryTitle !== null) {
          setClause.push(`primaryTitle = $${setValues.length + 1}`);
          setValues.push(primaryTitle);
        }
        if (secondaryTitle !== null) {
          setClause.push(`secondaryTitle = $${setValues.length + 1}`);
          setValues.push(secondaryTitle);
        }
        if (setClause.length === 0) {
          return res.status(400).json({ success: false, message: 'No fields to update.' });
        }

        // Final query
        const query = `UPDATE employee_salary SET ${setClause.join(', ')} WHERE first_name = $${setValues.length + 1} AND last_name = $${setValues.length + 2}`;
        setValues.push(first_name, last_name);

        const updateResult = await client.query(query, setValues);

        if (updateResult.rowCount === 0) {
          return res.status(404).json({ success: false, message: 'Employee not found.' });
        }


        if (sanitizedSalary || sanitizedRaise) {
          // Check if salary_effective_date and salarychangereason are also provided
          if (!sanitizedSalaryEffectiveDate || !salarychangereason) {
            // If either salary_effective_date or salarychangereason is missing, return a structured error response
            return res.status(400).json({
              success: false,
              message: 'Salary change reason & salary effective date must be entered with salary'
            });
          }
        
          // Proceed with inserting into the historical_salary_changes table
          await client.query(
            'INSERT INTO historical_salary_changes (m_first, first_name, last_name, primaryTitle, secondaryTitle, salary, salary_effective_date, salarychangereason) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
            [m_first, first_name, last_name, primaryTitle, secondaryTitle, sanitizedSalary, sanitizedSalaryEffectiveDate, salarychangereason]
          );
        }
        
        if (comment_logged) {
          // Check if sanitizedCommentDate is also provided
          if (!sanitizedCommentDate) {
            // If sanitizedCommentDate is missing, return a structured error response
            return res.status(400).json({
              success: false,
              message: 'Comment date must be provided when a comment is logged.'
            });
          }
        
          // Proceed with inserting into the historical_salary_comments table
          await client.query(
            'INSERT INTO historical_salary_comments (m_first, first_name, last_name, primaryTitle, secondaryTitle, comment_logged, comment_date) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [m_first, first_name, last_name, primaryTitle, secondaryTitle, comment_logged, sanitizedCommentDate]
          );
        }
        
        if (sanitizedBonus) {
          // Check if sanitizedBonusYear is also provided
          if (!sanitizedBonusYear) {
            // If sanitizedBonusYear is missing, return a structured error response
            return res.status(400).json({
              success: false,
              message: 'Bonus year must be provided when a bonus is entered.'
            });
          }
        
          // Proceed with inserting into the historical_bonuses table
          await client.query(
            'INSERT INTO historical_bonuses (m_first, first_name, last_name, primaryTitle, secondaryTitle, bonus, bonus_year) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [m_first, first_name, last_name, primaryTitle, secondaryTitle, sanitizedBonus, sanitizedBonusYear]
          );
        }
        

        // Trigger pushInc to update latest_employee_data
        await client.query('INSERT INTO pushInc (first_name, last_name) VALUES ($1, $2)', [first_name, last_name]);

        res.status(200).json({ success: true, message: 'Record updated and historical data inserted successfully.' });
      } catch (error) {
        handleDatabaseError(res, error);
      }
    });
    // Add a new employee
    app.post('/add-employee', async (req, res) => {
      const {add_first_name, add_last_name, employeeStatus } = req.body;

      // Validate required fields
      if (!add_first_name || !add_last_name || !employeeStatus) {
        return res.status(400).json({ success: false, message: 'First Name, Last Name, and Status are required.' });
      }

      try {
        // Insert into employee_salary
        await client.query(
          'INSERT INTO employee_salary (first_name, last_name, access_status) VALUES ($1, $2, $3)',
          [add_first_name, add_last_name, employeeStatus]
        );

        // Trigger pushInc to update latest_employee_data
        await client.query('INSERT INTO pushInc (first_name, last_name) VALUES ($1, $2)', [add_first_name, add_last_name]);

        res.status(200).json({ success: true, message: 'Employee added successfully.' });
      } catch (error) {
        handleDatabaseError(res, error);
      }
    });

    // Delete an employee
    app.post('/delete-employee', async (req, res) => {
      const {delete_first_name, delete_last_name } = req.body;

      // Validate required fields
      if (!delete_first_name || !delete_last_name) {
        return res.status(400).json({ success: false, message: 'Manager First Name, First Name, and Last Name are required.' });
      }

      try {
        // Delete from employee_salary
        await client.query(
          'DELETE FROM employee_salary WHERE first_name = $1 AND last_name = $2',
          [delete_first_name, delete_last_name]
        );
        await client.query(
          'DELETE FROM historical_salary_changes WHERE first_name = $1 AND last_name = $2',
          [delete_first_name, delete_last_name]
        );
        await client.query(
          'DELETE FROM historical_salary_comments WHERE first_name = $1 AND last_name = $2',
          [delete_first_name, delete_last_name]
        );
        await client.query(
          'DELETE FROM historical_bonuses WHERE first_name = $1 AND last_name = $2',
          [delete_first_name, delete_last_name]
        );
        // Trigger pushInc to update latest_employee_data
        await client.query('INSERT INTO pushInc (first_name, last_name) VALUES ($1, $2)', [delete_first_name, delete_last_name]);

        res.status(200).json({ success: true, message: 'Employee deleted successfully.' });
      } catch (error) {
        handleDatabaseError(res, error);
      }
    });
// In server.js, within the startServer function, add:

// Endpoint to update an employee's supervisor
app.post('/update-supervisor', async (req, res) => {
  const { emp_id, sup_id, sup_first_name, sup_last_name } = req.body;

  // Basic validation
  if (!emp_id || !sup_id || !sup_first_name || !sup_last_name) {
    return res.status(400).json({ success: false, message: 'Missing required fields.' });
  }

  try {
    // Update the supervisor information in your supervisors table
    const updateQuery = `
      UPDATE supervisors 
      SET sup_id = $1, sup_first_name = $2, sup_last_name = $3 
      WHERE emp_id = $4
    `;
    const updateValues = [sup_id, sup_first_name, sup_last_name, emp_id];
    const updateResult = await client.query(updateQuery, updateValues);

    if (updateResult.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    // Optionally, re-fetch the updated hierarchy data:
    const result = await client.query(`
      SELECT emp_first_name, emp_last_name, emp_id, sup_id, sup_first_name, sup_last_name 
      FROM supervisors
      ORDER BY sup_id, emp_id;
    `);
    const updatedHierarchy = buildHierarchy(result.rows);

    res.json({ success: true, updatedHierarchy });
  } catch (error) {
    console.error('Error updating supervisor:', error);
    res.status(500).json({ success: false, message: 'Update failed.' });
  }
});

    // Start the server
    const port = process.env.PORT || 4000;
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error('Error starting server:', error);
  }
};

// Start the server
startServer();
