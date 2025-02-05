const API_BASE_URL = "https://burness.onrender.com";
document.addEventListener("DOMContentLoaded", () => {
  // Fetch and populate employee data in the form when a user selects a name.
  const employeeSelect = document.getElementById('employeeSelect');
  const updateButton = document.getElementById('updateButton');
  const employeeForm = document.getElementById('employeeForm');

  // Populate dropdown list with employee names (first name, last name)
  fetch('/api/employees')
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        data.data.forEach(employee => {
          const option = document.createElement('option');
          option.value = `${employee.first_name} ${employee.last_name}`;
          option.textContent = `${employee.first_name} ${employee.last_name}`;
          employeeSelect.appendChild(option);
        });
      } else {
        console.error('Error fetching employees:', data.message);
      }
    })
    .catch(error => {
      console.error('Error:', error);
    });

  // Handle the update when the update button is clicked
  updateButton.addEventListener('click', (e) => {
    e.preventDefault();

    const selectedEmployee = employeeSelect.value.split(' '); // Split first and last name
    const firstName = selectedEmployee[0];
    const lastName = selectedEmployee[1];

    // Collect form data and allow null submissions for optional fields
    const data = {
      m_first: document.getElementById('m_first').value,
      first_name: firstName,
      last_name: lastName,
      primaryTitle: document.getElementById('primaryTitle').value || null,
      secondaryTitle: document.getElementById('secondaryTitle').value || null,
      salary: document.getElementById('salary').value ? parseInt(document.getElementById('salary').value) : null,
      date_salary_set: document.getElementById('date_salary_set').value || null,
      comment_logged: document.getElementById('comment_logged').value || null,
      comment_date: document.getElementById('comment_date').value || null,
      bonus: document.getElementById('bonus').value ? parseInt(document.getElementById('bonus').value) : null,
      bonus_year: document.getElementById('bonus_year').value ? parseInt(document.getElementById('bonus_year').value) : null,
    };

    // Validate required fields: m_first, first_name, last_name
    if (!data.m_first || !data.first_name || !data.last_name) {
      alert('Please fill out Manager\'s First Name, First Name, and Last Name.');
      return;
    }

    // Send the data to the server to update employee information
    fetch('/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          alert('Employee data updated successfully!');
          // Optionally, reset form after success
          employeeForm.reset();
        } else {
          alert('Error: ' + data.message);
        }
      })
      .catch((error) => {
        console.error('Error:', error);
        alert('An error occurred: ' + error.message);
      });
  });
});
