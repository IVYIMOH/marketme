import { supabase } from './lib/supabaseClient.js'

// Grab the elements from our HTML file
const emailInput = document.getElementById('email')
const passwordInput = document.getElementById('password')
const nameInput = document.getElementById('displayName')
const signupBtn = document.getElementById('signup-btn')
const googleBtn = document.getElementById('google-btn')
const statusDiv = document.getElementById('status')

// Helper function to show messages on the screen
function showMessage(text, isError = false) {
  statusDiv.innerText = text
  statusDiv.style.display = 'block'
  statusDiv.className = isError ? 'error' : 'success'
}

// 1. Handle Email & Password Signup
async function handleSignUp() {
  const email = emailInput.value
  const password = passwordInput.value
  const displayName = nameInput.value

  // Basic check to make sure fields aren't empty
  if (!email || !password || !displayName) {
    showMessage('Please fill out all fields.', true)
    return
  }

  showMessage('Registering user...')

  const { data, error } = await supabase.auth.signUp({
    email: email,
    password: password,
    options: {
      data: { full_name: displayName } // This is caught by your database trigger!
    }
  })

  if (error) {
    showMessage(`Error: ${error.message}`, true)
  } else {
    showMessage('Signup successful! Check your email inbox for a verification link.')
  }
}

// 2. Handle Google OAuth Login
async function handleGoogleLogin() {
  showMessage('Connecting to Google...')
  
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin // Automatically returns back to this index.html page
    }
  })

  if (error) {
    showMessage(`Google Error: ${error.message}`, true)
  }
}

// Attach these actions to our HTML buttons when clicked
signupBtn.addEventListener('click', handleSignUp)
googleBtn.addEventListener('click', handleGoogleLogin)
