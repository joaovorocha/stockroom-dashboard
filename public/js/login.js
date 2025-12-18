// Login page JavaScript

// Add quick nav on load
document.addEventListener('DOMContentLoaded', () => {
  addQuickNav(null, 'top'); // No active page
  addQuickNav(null, 'bottom');
});

const loginForm = document.getElementById('login-form');
const errorMessage = document.getElementById('error-message');
const employeeIdInput = document.getElementById('employee-id');

// Handle form submission
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const employeeId = employeeIdInput.value.trim();

  if (!employeeId) {
    showError('Please enter your Employee ID');
    return;
  }

  try {
    // Show loading state
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Logging in...';
    submitBtn.disabled = true;

    // Send login request
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ employeeId })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      // Login successful - redirect to home
      window.location.href = '/';
    } else {
      // Login failed
      showError(data.error || 'Invalid Employee ID');
      submitBtn.textContent = originalText;
      submitBtn.disabled = false;
      employeeIdInput.value = '';
      employeeIdInput.focus();
    }
  } catch (error) {
    console.error('Login error:', error);
    showError('Connection error. Please try again.');
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    submitBtn.textContent = 'Login';
    submitBtn.disabled = false;
  }
});

// Show error message
function showError(message) {
  errorMessage.textContent = `ERROR: ${message}`;
  errorMessage.classList.remove('hidden');

  // Hide after 5 seconds
  setTimeout(() => {
    errorMessage.classList.add('hidden');
  }, 5000);
}
