const API_BASE_URL = "https://burness.onrender.com";


// const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3000";
import { initInteractiveTree } from './app.js';  

// Variables to store employee data after successful passphrase verification
let employeesData = [];
let managerRole = null;



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

// Helper function to fetch employee data after verifying passphrase
async function fetchEmployees() {
  return employeesData;  // Use the stored employee data
}

// Helper function to populate a dropdown with unique values
function populateDropdown(selectElement, values) {
  selectElement.innerHTML = '<option value="">Select</option>'; // Clear current options
  const fragment = document.createDocumentFragment();

  values.forEach(value => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    fragment.appendChild(option);
  });

  selectElement.appendChild(fragment);
}

// Fetch and populate Last Name dropdown (for Update Compensation form)
async function populateLastNames() {
  const employees = await fetchEmployees();
  const lastNames = [...new Set(employees.map(emp => emp.last_name))];
  const lastNameSelect = document.getElementById('lastName');
  populateDropdown(lastNameSelect, lastNames);
}


// Fetch and populate First Name dropdown (for either form)
async function populateFirstNames(lastName, selectId) {
  const firstNameSelect = document.getElementById(selectId);
  firstNameSelect.innerHTML = '<option value="">Select First Name</option>';
  firstNameSelect.disabled = true;

  if (lastName) {
    // Filter employeesData to get matching first names based on last name
    const firstNames = employeesData
      .filter(emp => emp.last_name.toLowerCase() === lastName.toLowerCase()) // Case-insensitive comparison
      .map(emp => emp.first_name);

    populateDropdown(firstNameSelect, firstNames);
    firstNameSelect.disabled = false;
  }
}

// Populate the Delete Employee dropdowns
async function populateDeleteEmployeeDropdowns() {
  const employees = await fetchEmployees();
  const deleteLastNames = [...new Set(employees.map(emp => emp.last_name))];
  const deleteLastNameSelect = document.getElementById('deleteLastName');
  populateDropdown(deleteLastNameSelect, deleteLastNames);
}




document.addEventListener('DOMContentLoaded', () => {
  console.log("DOM fully loaded");
  initInteractiveTree();
  document.getElementById("hierarchyContainer").style.display = "none";
  const overlay = document.getElementById('overlay');
  const content = document.getElementById('content');
  const passphraseInput = document.getElementById('passphrase');
  const submitButton = document.getElementById('submitPassphrase');

  // Show the passphrase overlay when the page loads
  overlay.style.display = 'flex';
  content.classList.add('blur'); // Apply blur effect to the content
passphraseInput.focus();
  //submitButton.addEventListener('click', async function () {
    async function handleSubmit() {
    const enteredPassphrase = passphraseInput.value.trim();

    try {
      const response = await fetch('/verify-passphrase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passphrase: enteredPassphrase }),
      });

      const data = await response.json();

      if (data.success) {

        alert('Passphrase correct. You have access.');
        employeesData = data.employees;  // Store employee data after successful passphrase verification
        managerRole = data.role;  // Store the role (admin or manager)
        overlay.style.display = 'none';  // Hide the overlay
        content.classList.remove('blur');  // Remove the blur effect

        // Populate dropdowns only after successful passphrase entry
        populateLastNames(); // For the Update Compensation form
        populateDeleteEmployeeDropdowns(); // For the Delete Employee form

        // Function to populate title options
        function populateTitles(titles) {
          const titleSelect = document.getElementById('primaryTitle');
          titleSelect.innerHTML = "<option value=''>Select Primary Title</option>";
          titles.sort((a, b) => a.localeCompare(b));
          titles.forEach(title => {
            const option = document.createElement("option");
            option.value = title;
            option.textContent = title;
            titleSelect.appendChild(option);
          });
        }

        if (managerRole !== 'admin') {
          // Show only restricted titles for non-admin users
          const restrictedTitles = ["Senior Vice President", "Vice President", "Design Director", "Senior Writer", "Associate Vice President", "Senior Digital Strategist", "Senior Associate", "Senior Graphic Designer", "Digital Strategist", "Developer", "Associate", "Senior Digital Coordinator", "Graphic Designer", "Sr. Communications Coordinator", "Digital Coordinator", "Junior Graphic Designer", "Communications Coordinator", "Communications Assistant"];
          populateTitles(restrictedTitles);

          // Hide the Add/Delete employee sections for non-admin users
          document.getElementById('addEmployeeContainer').style.display = 'none';
          document.getElementById('deleteEmployeeContainer').style.display = 'none';
          
        } else {
          // Show all titles for admin users
          const allTitles = ["Accountant", "Senior Vice President", "Vice President", "Design Director", "Senior Writer", "Associate Vice President", "Senior Digital Strategist", "Senior Associate", "Senior Graphic Designer", "Digital Strategist", "Developer", "Associate", "Senior Digital Coordinator", "Graphic Designer", "Sr. Communications Coordinator", "Digital Coordinator", "Junior Graphic Designer", "Communications Coordinator", "Communications Assistant"];
          populateTitles(allTitles);

          // Show the Add/Delete employee sections for admin users
          document.getElementById('addEmployeeContainer').style.display = 'block';
          document.getElementById('deleteEmployeeContainer').style.display = 'block';
        }

      } else {
        alert('Incorrect passphrase. Access denied.');
      }
    } catch (error) {
      console.error('Error verifying passphrase:', error);
      alert('Failed to verify passphrase. Please try again.');
    }
  }
  passphraseInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault(); // Prevent default Enter key behavior (optional)
      handleSubmit();
    }
  });
  document.getElementById('submitPassphrase').addEventListener('click', function () {
    handleSubmit(); // Call the handleSubmit function when the button is clicked
});

});


  // Event listeners for handling changes in the dropdowns
  document.getElementById('lastName').addEventListener('change', (e) => {
    populateFirstNames(e.target.value, 'firstName'); // Populate first name for Update form
  });

  document.getElementById('deleteLastName').addEventListener('change', (e) => {
    const deleteLastName = e.target.value;
    populateFirstNames(deleteLastName, 'deleteFirstName'); // Populate first name for Delete form
  });

 // Handle Update Compensation form submission
 document.getElementById('updateForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const formData = new FormData(e.target);
  const data = Object.fromEntries(formData.entries());
  const primaryTitle = document.getElementById('primaryTitle');
  primaryTitle.removeAttribute('required');
  console.log('Data being sent to API:', data);

  try {
    const response = await fetch(`${API_BASE_URL}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `HTTP error! Status: ${response.status}`);
    }
  
    const result = await response.json();
  
    if (result.success) {
      alert(result.message || 'Compensation updated successfully!');
      document.getElementById('updateForm').reset();
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

    if (!data.add_first_name || !data.add_last_name) {
      alert('Please select an employee to add.');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/add-employee`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();
      if (response.ok) {
        alert(result.message || 'Employee added successfully!');
        document.getElementById('addEmployeeForm').reset();
        await populateLastNames(); // Refresh the dropdowns after adding employee
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
    e.preventDefault(); // Prevent form submission so we can handle it with confirmation

    const deleteLastName = document.getElementById('deleteLastName').value;
    const deleteFirstName = document.getElementById('deleteFirstName').value;

    if (!deleteFirstName || !deleteLastName) {
      alert('Please select an employee to delete.');
      return;
    }

    // Confirmation prompt before proceeding with deletion
    const confirmation = window.confirm(`Are you sure you want to delete ${deleteFirstName} ${deleteLastName}? This action cannot be undone.`);
  
    if (confirmation) {
      try {
        const response = await fetch(`${API_BASE_URL}/delete-employee`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            delete_first_name: deleteFirstName,
            delete_last_name: deleteLastName,
          }),
        });

        const result = await response.json();
        if (response.ok) {
          alert(result.message || 'Employee deleted successfully!');
          document.getElementById('deleteEmployeeForm').reset();
          await populateDeleteEmployeeDropdowns(); // Refresh the dropdowns after deletion
        } else {
          alert(result.message || 'Error deleting employee.');
        }
      } catch (error) {
        console.error('Request failed:', error);
        alert('Failed to delete employee. Please try again.');
      }
    } else {
      console.log("Employee deletion canceled.");
    }
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

  flatpickr("#salary_effective_date", {
    // Options for flatpickr to restrict to the 1st and 16th of each month
    dateFormat: "Y-m-d",
    disable: [
      (date) => date.getDate() !== 1 && date.getDate() !== 16
    ]
  });


  // Toggle to reveal Hierarchy / Form

document.getElementById("toggleTreeBtn").addEventListener("click", function() {
  const form = document.querySelector("form");
  const treeContainer = document.getElementById("hierarchyContainer");


  if (treeContainer.style.display === "none" || treeContainer.style.display === "") {
      form.style.display = "none";  // Hide form
      treeContainer.style.display = "block";  // Show hierarchy
      initInteractiveTree();  // Load the tree
      this.textContent = "Back to Employee Form";
  } else {
      form.style.display = "block";  // Show form
      treeContainer.style.display = "none";  // Hide hierarchy
      this.textContent = "Show Employee Hierarchy";
  }
});

// Ensure elements are hidden by default
document.addEventListener("DOMContentLoaded", function() {
  document.getElementById("hierarchyContainer").style.display = "none";
});

// script.js


