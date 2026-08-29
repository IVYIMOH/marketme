import { supabase } from './lib/supabaseClient.js'

// ---------------------------------------------------------------------------
// Element refs
// ---------------------------------------------------------------------------
const loadingView = document.getElementById('loading-view')
const authView    = document.getElementById('auth-view')
const appView     = document.getElementById('app-view')

const tabSignIn   = document.getElementById('tab-signin')
const tabSignUp   = document.getElementById('tab-signup')
const signInForm  = document.getElementById('signin-form')
const signUpForm  = document.getElementById('signup-form')

const signInEmail    = document.getElementById('signin-email')
const signInPassword = document.getElementById('signin-password')
const signInBtn      = document.getElementById('signin-btn')

const signUpEmail       = document.getElementById('signup-email')
const signUpPassword    = document.getElementById('signup-password')
const signUpDisplayName = document.getElementById('signup-display-name')
const signUpBtn         = document.getElementById('signup-btn')

const signOutBtn      = document.getElementById('signout-btn')
const userEmailEl     = document.getElementById('user-email')
const userDisplayName = document.getElementById('user-display-name')
const userRoleEl      = document.getElementById('user-role')

const statusDiv = document.getElementById('status')

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------
function showMessage(text, isError = false) {
  statusDiv.innerText = text
  statusDiv.className = isError ? 'error' : 'success'
}

function clearMessage() {
  statusDiv.innerText = ''
  statusDiv.className = ''
}

function setBusy(button, busy, label) {
  button.disabled = busy
  button.innerText = label
}

// ---------------------------------------------------------------------------
// View switching
// ---------------------------------------------------------------------------
function showSignedIn(session) {
  loadingView.hidden = true
  authView.hidden    = true
  appView.hidden     = false
  userEmailEl.innerText = session.user.email ?? '(no email)'
}

function showSignedOut() {
  loadingView.hidden = true
  appView.hidden     = true
  authView.hidden    = false
  userDisplayName.innerText = '…'
  userRoleEl.innerText      = '…'
}

function selectTab(which) {
  const signingIn = which === 'signin'
  tabSignIn.setAttribute('aria-selected', String(signingIn))
  tabSignUp.setAttribute('aria-selected', String(!signingIn))
  signInForm.hidden = !signingIn
  signUpForm.hidden = signingIn
  clearMessage()
}

// ---------------------------------------------------------------------------
// Profile fetch. Deliberately NOT called from inside the onAuthStateChange
// callback -- see the note on that listener below.
// ---------------------------------------------------------------------------
async function loadProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('display_name, role')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    userDisplayName.innerText = '(could not load)'
    userRoleEl.innerText      = '(could not load)'
    showMessage(`Could not load your profile: ${error.message}`, true)
    return
  }

  if (!data) {
    // The handle_new_user() trigger on auth.users should always have written
    // this row. If it is missing, say so plainly rather than showing blanks.
    userDisplayName.innerText = '(no profile row found)'
    userRoleEl.innerText      = '(no profile row found)'
    return
  }

  userDisplayName.innerText = data.display_name ?? '(not set)'
  userRoleEl.innerText      = data.role
}

// ---------------------------------------------------------------------------
// Session restore + reaction to every auth change.
//
// Registering this listener is what restores an existing session on page load:
// supabase-js persists the session in localStorage and emits INITIAL_SESSION
// here once it has read it back. SIGNED_IN / SIGNED_OUT / TOKEN_REFRESHED all
// arrive through the same path, so the UI has exactly one source of truth.
//
// The callback body stays synchronous. supabase-js invokes it while holding an
// internal auth lock, and awaiting another Supabase call in here can deadlock
// that lock, so the profile read is pushed to a fresh task with setTimeout.
// ---------------------------------------------------------------------------
supabase.auth.onAuthStateChange((event, session) => {
  if (session) {
    showSignedIn(session)
    setTimeout(() => loadProfile(session.user.id), 0)
  } else {
    showSignedOut()
  }
})

// ---------------------------------------------------------------------------
// 1. Sign in with email + password
// ---------------------------------------------------------------------------
async function handleSignIn(event) {
  event.preventDefault()

  const email    = signInEmail.value.trim()
  const password = signInPassword.value

  if (!email || !password) {
    showMessage('Enter your email and password.', true)
    return
  }

  clearMessage()
  setBusy(signInBtn, true, 'Signing in…')

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  setBusy(signInBtn, false, 'Sign In')

  if (error) {
    // Surface "Email not confirmed" for what it is: the account exists and the
    // password is right, but the verification link has not been clicked yet.
    const hint = /confirm/i.test(error.message)
      ? ' Check your inbox for the verification link and click it, then sign in again.'
      : ''
    showMessage(`Sign-in failed: ${error.message}.${hint}`, true)
    return
  }

  // onAuthStateChange renders the signed-in view; nothing to do here.
  signInPassword.value = ''
  clearMessage()
}

// ---------------------------------------------------------------------------
// 2. Sign up with email + password
// ---------------------------------------------------------------------------
async function handleSignUp(event) {
  event.preventDefault()

  const email       = signUpEmail.value.trim()
  const password    = signUpPassword.value
  const displayName = signUpDisplayName.value.trim()

  if (!email || !password || !displayName) {
    showMessage('Please fill out all fields.', true)
    return
  }

  clearMessage()
  setBusy(signUpBtn, true, 'Registering…')

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: displayName } // Read by the handle_new_user() trigger
    }
  })

  setBusy(signUpBtn, false, 'Sign Up with Email')

  if (error) {
    showMessage(`Error: ${error.message}`, true)
    return
  }

  if (data.session) {
    // Confirmations are off on this project: the user is already signed in and
    // onAuthStateChange has switched the view.
    clearMessage()
    return
  }

  // No session means this project requires email confirmation before the
  // account can be used. Say so explicitly instead of implying success.
  showMessage(
    'Account created. You must click the verification link in your email ' +
    'before you can sign in — until then, sign-in will be refused.'
  )
}

// ---------------------------------------------------------------------------
// 3. Sign out
// ---------------------------------------------------------------------------
async function handleSignOut() {
  setBusy(signOutBtn, true, 'Signing out…')

  const { error } = await supabase.auth.signOut()

  setBusy(signOutBtn, false, 'Sign Out')

  if (error) {
    showMessage(`Sign-out failed: ${error.message}`, true)
    return
  }

  // onAuthStateChange renders the signed-out view.
  clearMessage()
}

// ---------------------------------------------------------------------------
// Wire up
// ---------------------------------------------------------------------------
signInForm.addEventListener('submit', handleSignIn)
signUpForm.addEventListener('submit', handleSignUp)
signOutBtn.addEventListener('click', handleSignOut)
tabSignIn.addEventListener('click', () => selectTab('signin'))
tabSignUp.addEventListener('click', () => selectTab('signup'))
