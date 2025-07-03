import express from 'express';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import createConnection from './config/db.js'; // Import the database connection
import dotenv from 'dotenv';
import { startCronJob } from './cronJob.js';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Serve static files from the "public" folder and node_modules if needed
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

// Helper function to sanitize numerical values
const sanitizeNumber = (value) => {
  if (value === "" || value === null || value === undefined) {
    return null; // Replace empty string or null/undefined with NULL
  }
  const parsedValue = parseFloat(value);
  return !Number.isNaN(parsedValue) ? parsedValue : null;
};

// Build hierarchy function for supervisors
function buildHierarchy(data) {
  const map = {};
  const roots = [];

  // Create a map of employees and initialize children array
  data.forEach(item => {
    const employee = {
      emp_first_name: item.emp_first_name,
      emp_last_name: item.emp_last_name,
      emp_id: item.emp_id,
      sup_id: item.sup_id,
      sup_first_name: item.sup_first_name,
      sup_last_name: item.sup_last_name,
      children: []
    };
    map[item.emp_id] = employee;

    // Top-level employees have no supervisor (sup_id is null)
    if (item.sup_id === null) {
      roots.push(employee);
    }
  });

  // Link employees to their supervisors
  data.forEach(item => {
    if (item.sup_id !== null) {
      const employee = map[item.emp_id];
      const supervisor = map[item.sup_id];
      if (supervisor) {
        supervisor.children.push(employee);
      }
    }
  });

  return roots;
}

function buildDivisionHierarchy(data, division) {
  // Create the root box for the division
  const root = {
    label: division,
    children: []
  };

  // A map to hold nodes keyed by "first_name last_name" for quick lookup
  const map = {};

  // First pass: Add top-level employees (those without a supervisor or with null supervisor)
  data.forEach(item => {
    if (item.division === division) {
      // Check for both missing and null supervisor fields
      const isTopLevel = (
        (!item.direct_first_name && !item.direct_last_name) || // Missing fields
        (item.direct_first_name === null && item.direct_last_name === null) // Explicit null
      );

      if (isTopLevel) {
        const key = `${item.first_name} ${item.last_name}`;
        const node = {
          first_name: item.first_name,
          last_name: item.last_name,
          division: item.division,
          children: []
        };
        map[key] = node;
        root.children.push(node);
      }
    }
  });

  // Second pass: For employees with supervisor info, find their supervisor in the map and attach them
  data.forEach(item => {
    if (item.division === division) {
      // Check if this item has a supervisor (non-null and exists)
      const hasSupervisor = (
        item.direct_first_name && item.direct_last_name && // Both fields exist
        !(item.direct_first_name === null && item.direct_last_name === null) // Not both null
      );

      if (hasSupervisor) {
        const supervisorKey = `${item.direct_first_name} ${item.direct_last_name}`;
        const key = `${item.first_name} ${item.last_name}`;
        
        // Create node if it doesn't exist
        if (!map[key]) {
          map[key] = {
            first_name: item.first_name,
            last_name: item.last_name,
            division: item.division,
            children: []
          };
        }

        // Attach to supervisor if found, otherwise to root
        if (map[supervisorKey]) {
          map[supervisorKey].children.push(map[key]);
        } else {
          // Optionally attach to root if supervisor not found
          root.children.push(map[key]);
        }
      }
    }
  });

  return root;
}

// Endpoint to fetch hierarchy data after password verification
app.get('/get-hierarchy', async (req, res) => {
  try {
    const result = await client.query(
      'SELECT emp_first_name, emp_last_name, emp_id, sup_id, sup_first_name, sup_last_name FROM supervisors ORDER BY sup_id, emp_id;'
    );
    const employees = result.rows;
    const hierarchy = buildHierarchy(employees);
    res.json(hierarchy);
  } catch (err) {
    console.error('Error fetching hierarchy:', err);
    res.status(500).send('Error fetching data');
  }
});

app.get('/get-second-hierarchy', async (req, res) => {
  try {
    // Query all employees (modify if needed)
    const result = await client.query(
      `SELECT first_name, last_name, division, direct_first_name, direct_last_name 
       FROM emailaid
       ORDER BY division, first_name;`
    );
    const data = result.rows;
    
    // Build hierarchy for Global and Domestic divisions
    const globalHierarchy = buildDivisionHierarchy(data, 'global');
    const domesticHierarchy = buildDivisionHierarchy(data, 'domestic');
    
    res.json({
      global: globalHierarchy,
      domestic: domesticHierarchy
    });
  } catch (err) {
    console.error('Error fetching hierarchy:', err);
    res.status(500).send('Error fetching data');
  }
});

// Endpoint to verify the passphrase and return employee data
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
    employeesQuery = 'SELECT first_name, last_name FROM employee_salary ORDER BY last_name ASC';
  } else {
    return res.status(403).json({ success: false, message: 'Incorrect passphrase. Access denied.' });
  }

  try {
    client = await createConnection();
    console.log('Database connected successfully.');
    
    const result = role === 'admin'
      ? await client.query(employeesQuery)
      : await client.query(employeesQuery, ['restricted']);

    res.status(200).json({
      success: true,
      role: role,
      employees: result.rows
    });
  } catch (error) {
    handleDatabaseError(res, error);
  }
});

// Endpoint to update employee compensation
app.post('/update', async (req, res) => {
  const {
    m_first, first_name, last_name, primaryTitle, secondaryTitle, salary,
    salary_effective_date, salarychangereason, comment_logged, comment_date, bonus, bonus_year, raisePercentage
  } = req.body;

  if (!m_first || !first_name || !last_name) {
    return res.status(400).json({ success: false, message: 'Manager first name, First name, and Last name are required.' });
  }

  const sanitizedSalary = sanitizeNumber(salary);
  const sanitizedRaise = sanitizeNumber(raisePercentage);
  const sanitizedBonus = sanitizeNumber(bonus);

  const isValidDate = (dateString) => {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    return regex.test(dateString) && !isNaN(new Date(dateString).getTime());
  };

  const sanitizedBonusDate = bonus_year && isValidDate(bonus_year) ? bonus_year : null;
  const sanitizedSalaryEffectiveDate = salary_effective_date && isValidDate(salary_effective_date) ? salary_effective_date : null;
  const sanitizedCommentDate = comment_date && isValidDate(comment_date) ? comment_date : null;

  try {
    const currentSalaryQuery = `
      SELECT latest_salary
      FROM latest_employee_data
      WHERE first_name = $1 AND last_name = $2;
    `;
    const trimmedFirstName = first_name.trim();
    const trimmedLastName = last_name.trim();

    console.log("Executing query:", currentSalaryQuery);
    console.log("Query parameters:", [trimmedFirstName, trimmedLastName]);
    const currentSalaryResult = await client.query(currentSalaryQuery, [trimmedFirstName, trimmedLastName]);
    console.log("Query result:", currentSalaryResult.rows);

    if (currentSalaryResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Employee not found in latest_employee_data.' });
    }

    const currentSalary = currentSalaryResult.rows[0].latest_salary;
    console.log("Current Salary:", currentSalary);
    let newSalary = currentSalary;

    if (sanitizedSalary !== null && sanitizedRaise !== null) {
      return res.status(400).json({ 
        success: false, 
        message: 'Salary and percent raise cannot be submitted together.' 
      });
    }
    if (sanitizedCommentDate && (!comment_logged || comment_logged.trim() === '')) {
      return res.status(400).json({ 
        success: false, 
        message: 'Comment date cannot be provided without a comment.' 
      });
    }
    if (sanitizedSalaryEffectiveDate && sanitizedSalary === null && sanitizedRaise === null) {
      return res.status(400).json({ 
        success: false, 
        message: 'Salary effective date cannot be provided without a salary or raise.' 
      });
    }
    if (sanitizedBonusDate && sanitizedBonus === null) {
      return res.status(400).json({ 
        success: false, 
        message: 'Bonus date cannot be provided without a bonus.' 
      });
    }

    if (sanitizedRaise !== null) {
      const raiseDecimal = parseFloat(sanitizedRaise) / 100;
      newSalary = Math.ceil((currentSalary * (1 + raiseDecimal)) / 10) * 10;
    } else if (sanitizedSalary !== null) {
      newSalary = Math.ceil(sanitizedSalary / 10) * 10;
    }

    const setClause = [];
    const setValues = [];

    if (sanitizedSalary !== null || sanitizedRaise !== null) {
      setClause.push(`salary = $${setValues.length + 1}`);
      setValues.push(newSalary);
    }
    if (sanitizedSalaryEffectiveDate) {
      setClause.push(`salary_effective_date = $${setValues.length + 1}`);
      setValues.push(sanitizedSalaryEffectiveDate);
    }
    if (sanitizedSalaryEffectiveDate && salarychangereason) {
      setClause.push(`salarychangereason = $${setValues.length + 1}`);
      setValues.push(salarychangereason);
    }
    if (comment_logged) {
      setClause.push(`comment_logged = $${setValues.length + 1}`);
      setValues.push(comment_logged);
    }
    if (sanitizedCommentDate) {
      setClause.push(`comment_date = $${setValues.length + 1}`);
      setValues.push(sanitizedCommentDate);
    }
    if (sanitizedBonus !== null) {
      setClause.push(`bonus = $${setValues.length + 1}`);
      setValues.push(sanitizedBonus);
    }
    if (sanitizedBonusDate) {
      setClause.push(`bonus_date = $${setValues.length + 1}`);
      setValues.push(sanitizedBonusDate);
    }
    if (primaryTitle) {
      setClause.push(`primaryTitle = $${setValues.length + 1}`);
      setValues.push(primaryTitle);
    }
    if (secondaryTitle) {
      setClause.push(`secondaryTitle = $${setValues.length + 1}`);
      setValues.push(secondaryTitle);
    }

    if (setClause.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update.' });
    }

    const query = `UPDATE employee_salary SET ${setClause.join(', ')} WHERE first_name = $${setValues.length + 1} AND last_name = $${setValues.length + 2}`;
    setValues.push(first_name, last_name);

    const updateResult = await client.query(query, setValues);

    if (updateResult.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    if (sanitizedSalary !== null || sanitizedRaise !== null) {
      if (!sanitizedSalaryEffectiveDate || !salarychangereason) {
        return res.status(400).json({
          success: false,
          message: 'Salary change reason & salary effective date must be entered with salary'
        });
      }
      await client.query(
        'INSERT INTO historical_salary_changes (m_first, first_name, last_name, primaryTitle, secondaryTitle, salary, salary_effective_date, salarychangereason) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [m_first, first_name, last_name, primaryTitle, secondaryTitle, newSalary, sanitizedSalaryEffectiveDate, salarychangereason]
      );
    }

    if (comment_logged) {
      await client.query(
        'INSERT INTO historical_salary_comments (m_first, first_name, last_name, primaryTitle, secondaryTitle, comment_logged, comment_date) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [m_first, first_name, last_name, primaryTitle, secondaryTitle, comment_logged, sanitizedCommentDate]
      );
    }

    if (sanitizedBonus !== null) {
      await client.query(
        'INSERT INTO historical_bonuses (m_first, first_name, last_name, primaryTitle, secondaryTitle, bonus, bonus_date) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [m_first, first_name, last_name, primaryTitle, secondaryTitle, sanitizedBonus, sanitizedBonusDate]
      );
    }

    await client.query('INSERT INTO pushInc (first_name, last_name) VALUES ($1, $2)', [first_name, last_name]);

    res.status(200).json({ success: true, message: 'Record updated and historical data inserted successfully.' });
  } catch (error) {
    handleDatabaseError(res, error);
  }
});

// Add a new employee
app.post('/add-employee', async (req, res) => {
  const { add_first_name, add_last_name, employeeStatus, add_email } = req.body;

  if (!add_first_name || !add_last_name || !employeeStatus) {
    return res.status(400).json({ success: false, message: 'First Name, Last Name, and Status are required.' });
  }

  try {
    await client.query(
      'INSERT INTO employee_salary (first_name, last_name, access_status) VALUES ($1, $2, $3)',
      [add_first_name, add_last_name, employeeStatus]
    );
    await client.query(
      'INSERT INTO supervisors (emp_first_name, emp_last_name) VALUES ($1, $2)',
      [add_first_name, add_last_name]
    );
    await client.query(
      'INSERT INTO salary_review_data (first_name, last_name, email) VALUES ($1, $2, $3)',
      [add_first_name, add_last_name, add_email]
    );
    await client.query('INSERT INTO pushInc (first_name, last_name) VALUES ($1, $2)', [add_first_name, add_last_name]);
    res.status(200).json({ success: true, message: 'Employee added successfully.' });
  } catch (error) {
    handleDatabaseError(res, error);
  }
});

// Delete an employee
app.post('/delete-employee', async (req, res) => {
  const { delete_first_name, delete_last_name } = req.body;

  if (!delete_first_name || !delete_last_name) {
    return res.status(400).json({ success: false, message: 'Manager First Name, First Name, and Last Name are required.' });
  }

  try {
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
    await client.query(
      'DELETE FROM supervisors WHERE emp_first_name = $1 AND emp_last_name = $2',
      [delete_first_name, delete_last_name]
    );
    await client.query(
      'DELETE FROM salary_review_data WHERE first_name = $1 AND last_name = $2',
      [delete_first_name, delete_last_name]
    );
    await client.query(
      'DELETE FROM emailaid WHERE first_name = $1 AND last_name = $2',
      [delete_first_name, delete_last_name]
    );

    await client.query('INSERT INTO pushInc (first_name, last_name) VALUES ($1, $2)', [delete_first_name, delete_last_name]);
    res.status(200).json({ success: true, message: 'Employee deleted successfully.' });
  } catch (error) {
    handleDatabaseError(res, error);
  }
});

// Endpoint to update an employee's supervisor (only one definition)
app.post('/update-supervisor', async (req, res) => {
  const { emp_id, sup_id, sup_first_name, sup_last_name } = req.body;

  if (!emp_id || !sup_id || !sup_first_name || !sup_last_name) {
    return res.status(400).json({ success: false, message: 'Missing required fields.' });
  }

  try {
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

// Endpoint to update an employee's division and direct supervisor
app.post('/update-email', async (req, res) => {
  const { dragged_first_name, dragged_last_name, target_division, target_first_name, target_last_name } = req.body;

  if (!dragged_first_name || !dragged_last_name || !target_division) {
    return res.status(400).json({ success: false, message: 'Missing required fields.' });
  }

  try {
    let updateQuery, updateValues;
    if (target_first_name == null || target_last_name == null) {
      updateQuery = `
        UPDATE emailaid 
        SET division = $1, direct_first_name = NULL, direct_last_name = NULL 
        WHERE first_name = $2 AND last_name = $3
      `;
      updateValues = [target_division.toLowerCase(), dragged_first_name, dragged_last_name];
    } else {
      updateQuery = `
        UPDATE emailaid 
        SET division = $1, direct_first_name = $2, direct_last_name = $3 
        WHERE first_name = $4 AND last_name = $5
      `;
      updateValues = [target_division, target_first_name, target_last_name, dragged_first_name, dragged_last_name];
    }

    const updateResult = await client.query(updateQuery, updateValues);

    if (updateResult.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Record not found.' });
    }

    const result = await client.query(`
      SELECT first_name, last_name, division, direct_first_name, direct_last_name 
      FROM emailaid
      ORDER BY division, first_name, last_name;
    `);
    const updatedHierarchy = buildHierarchy(result.rows);

    res.json({ success: true, updatedHierarchy });
  } catch (error) {
    console.error('Error updating emailaid:', error);
    res.status(500).json({ success: false, message: 'Update failed.' });
  }
});

// Initialize the database connection and start the server
const startServer = async () => {
  try {
    client = await createConnection();
    console.log('Database connected successfully.');

    startCronJob(client);

    const port = process.env.PORT || 4000;
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error('Error starting server:', error);
  }
};

startServer();
