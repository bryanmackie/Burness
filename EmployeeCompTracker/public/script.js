const API_BASE_URL = "https://burness.onrender.com";
// const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3000";

// Helper function to fetch data from the API
async function fetchData(url) {
  try {
    const response = await fetch(url);
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.message || 'Failed to fetch data');
    }
    return data.data;
  } catch (error) {
    console.error('Error fetching data:', error);
    alert('Failed to fetch data. Please try again.');
    throw error;
  }
}

// Fetch and populate Last Name dropdown (for Update Compensation form)
async function populateLastNames() {
  try {
    const employees = await fetchData(`${API_BASE_URL}/api/employees`);
    const lastNameSelect = document.getElementById('lastName');
    const lastNames = [...new Set(employees.map(emp => emp.last_name))];

    lastNames.forEach(lastName => {
      const option = document.createElement('option');
      option.value = lastName;
      option.textContent = lastName;
      lastNameSelect.appendChild(option);
    });
  } catch (error) {
    console.error('Error populating last names:', error);
  }
}

// Fetch and populate First Name dropdown (for Update Compensation form)
async function populateFirstNames(lastName) {
  const firstNameSelect = document.getElementById('firstName');
  firstNameSelect.innerHTML = '<option value="">Select First Name</option>';
  firstNameSelect.disabled = true;

  if (lastName) {
    try {
      const employees = await fetchData(`${API_BASE_URL}/api/first-names/${lastName}`);
      employees.forEach(emp => {
        const option = document.createElement('option');
        option.value = emp.first_name;
        option.textContent = emp.first_name;
        firstNameSelect.appendChild(option);
      });
      firstNameSelect.disabled = false;
    } catch (error) {
      console.error('Error populating first names:', error);
    }
  }
}

// Populate the Delete Employee dropdowns
async function populateDeleteEmployeeDropdowns() {
  try {
    const employee = await fetchData(`${API_BASE_URL}/api/employees`);
    const deleteLastNameSelect = document.getElementById('deleteLastName');
    const deleteLastNames = [...new Set(employee.map(emp => emp.last_name))];

    deleteLastNames.forEach(deleteLastName => {
      const option = document.createElement('option');
      option.value = deleteLastName;
      option.textContent = deleteLastName;
      deleteLastNameSelect.appendChild(option);
    });
  } catch (error) {
    console.error('Error populating delete employee dropdowns:', error);
  }
}
async function populateDeleteFirstNames(deleteLastName) {
  const deleteFirstNameSelect = document.getElementById('deleteFirstName');
  deleteFirstNameSelect.innerHTML = '<option value="">Select First Name</option>';
  deleteFirstNameSelect.disabled = true;

  if (deleteLastName) {
    try {
      const employee = await fetchData(`${API_BASE_URL}/api/first-names/${deleteLastName}`);
      employee.forEach(emp => {
        const option = document.createElement('option');
        option.value = emp.first_name;
        option.textContent = emp.first_name;
        deleteFirstNameSelect.appendChild(option);
      });
      deleteFirstNameSelect.disabled = false;
    } catch (error) {
      console.error('Error populating first names:', error);
    }
  }
}
//Handle primaryTitle dropdown
document.getElementById('updateForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const formData = new FormData(e.target);
  const data = Object.fromEntries(formData.entries());

  try {
    const response = await fetch(`${API_BASE_URL}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    const result = await response.json();
    if (response.ok) {
      alert(result.message || 'Compensation updated successfully!');
    } else {
      alert(result.message || 'Error updating compensation.');
    }
  } catch (error) {
    console.error('Request failed:', error);
  }
});

// Handle form submissions
document.addEventListener('DOMContentLoaded', () => {
  populateLastNames(); // For the Update Compensation form
  populateDeleteEmployeeDropdowns(); // For the Delete Employee form

  document.getElementById('lastName').addEventListener('change', (e) => {
    populateFirstNames(e.target.value);
  });

  document.getElementById('deleteLastName').addEventListener('change', async (e) => {
    const lastName = e.target.value;
    const firstNameSelect = document.getElementById('deleteFirstName');

    firstNameSelect.innerHTML = '<option value="">Select First Name</option>';
    firstNameSelect.disabled = true;

    if (lastName) {
      await populateFirstNames(lastName);
    }
  });

  // Handle Update Compensation form submission
  document.getElementById('updateForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());

    console.log('Data being sent to API:', data);

    try {
      const response = await fetch(`${API_BASE_URL}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
    
      const result = await response.json();
    
      if (result.success) {
        alert(result.message || 'Compensation updated successfully!');
      } else {
        alert(result.message || 'Error updating compensation.');
      }
    
    } catch (error) {
      console.error('Request failed:', error);
      alert(`Failed to update compensation. Please try again. ${error.message}`);
    }
  });

  // Handle Add Employee form submission
  document.getElementById('addEmployeeForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());

    try {
      const response = await fetch(`${API_BASE_URL}/add-employee`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();
      if (response.ok) {
        alert(result.message || 'Employee added successfully!');
        await populateLastNames(); // Refresh the dropdowns
      } else {
        alert(result.message || 'Error adding employee.');
      }
    } catch (error) {
      console.error('Request failed:', error);
      alert('Failed to add employee. Please try again.');
    }
  });

  // Handle Delete Employee form submission
  document.getElementById('deleteEmployeeForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const deleteLastName = document.getElementById('deleteLastName').value;
    const deleteFirstName = document.getElementById('deleteFirstName').value;

    if (!deleteFirstName || !deleteLastName) {
      alert('Please select an employee to delete.');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/delete-employee`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delete_first_name: deleteFirstName, delete_last_name: deleteLastName }),
      });

      const result = await response.json();
      if (response.ok) {
        alert(result.message || 'Employee deleted successfully!');
        await populateDeleteEmployeeDropdowns(); // Refresh the dropdowns
      } else {
        alert(result.message || 'Error deleting employee.');
      }
    } catch (error) {
      console.error('Request failed:', error);
      alert('Failed to delete employee. Please try again.');
    }
  });
});


// JavaScript to toggle the dropdown visibility on button click
document.querySelectorAll('.dropbtn').forEach(function(button) {
  button.addEventListener('click', function(event) {
    // Toggle display of the respective dropdown content
    var dropdownContent = button.nextElementSibling;
    
    // Toggle the display state of dropdown content
    dropdownContent.style.display = (dropdownContent.style.display === 'block') ? 'none' : 'block';
    
    // Optional: Close the dropdown if clicking anywhere outside of it
    window.addEventListener('click', function(e) {
      if (!e.target.matches('.dropbtn') && !e.target.closest('.dropdown')) {
        dropdownContent.style.display = 'none';
      }
    });
  });
});
