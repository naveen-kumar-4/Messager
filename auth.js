// auth.js - Login & Registration Logic (Firebase Compat style)

let isLogin = true;

const toggleLink = document.getElementById('auth-toggle-link');
const authTitle = document.getElementById('auth-title');
const authBtn = document.getElementById('auth-btn');
const authSwitchText = document.getElementById('auth-switch-text');
const nameGroup = document.getElementById('name-group');
const inviteGroup = document.getElementById('invite-group');
const authForm = document.getElementById('auth-form');
const authError = document.getElementById('auth-error');

function showError(msg) {
    if (authError) {
        authError.textContent = msg;
        authError.style.display = 'block';
    } else {
        alert(msg);
    }
}

function clearError() {
    if (authError) {
        authError.textContent = '';
        authError.style.display = 'none';
    }
}

// Toggle between Login and Sign Up UI
toggleLink.addEventListener('click', () => {
    isLogin = !isLogin;
    clearError();
    if (isLogin) {
        authTitle.textContent = 'Welcome Back';
        authBtn.textContent = 'Log In';
        authSwitchText.textContent = "Don't have an account? ";
        toggleLink.textContent = 'Sign Up';
        nameGroup.style.display = 'none';
        inviteGroup.style.display = 'none';
    } else {
        authTitle.textContent = 'Create Account';
        authBtn.textContent = 'Sign Up';
        authSwitchText.textContent = "Already have an account? ";
        toggleLink.textContent = 'Log In';
        nameGroup.style.display = 'block';
        inviteGroup.style.display = 'block';
    }
});

// Handle form submit
authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();
    authBtn.disabled = true;
    authBtn.textContent = 'Please wait...';

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();

    try {
        if (isLogin) {
            // --- LOGIN ---
            await auth.signInWithEmailAndPassword(email, password);

            // Failsafe: create profile if it doesn't exist yet
            const user = auth.currentUser;
            const userDoc = await db.collection('users').doc(user.uid).get();
            if (!userDoc.exists) {
                await db.collection('users').doc(user.uid).set({
                    uid: user.uid,
                    name: email.split('@')[0],
                    email: email,
                    isOnline: true,
                    createdAt: new Date()
                });
            }

            window.location.href = 'index.html';

        } else {
            // --- SIGN UP ---
            const name = document.getElementById('name').value.trim() || email.split('@')[0];
            const inviteCode = document.getElementById('invite-code').value.trim();

            // Verify invite code if entered
            if (inviteCode) {
                const standardCodes = ['messager', '1234', 'admin', 'vip', 'secret'];
                const isStandardCode = standardCodes.includes(inviteCode.toLowerCase());

                if (!isStandardCode) {
                    try {
                        const inviteDoc = await db.collection('invites').doc(inviteCode).get();
                        if (!inviteDoc.exists) {
                            throw new Error('Invalid invite code! (Leave it blank or use "messager")');
                        }
                    } catch (inviteErr) {
                        if (inviteErr.message.includes('Invalid invite code')) {
                            throw inviteErr;
                        }
                        // If Firestore blocked unauthenticated read, proceed with account creation
                        console.warn('Firestore invite check bypassed due to permissions:', inviteErr.message);
                    }
                }
            }

            // Create the account in Firebase Auth
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;

            // Save profile in Firestore
            try {
                await db.collection('users').doc(user.uid).set({
                    uid: user.uid,
                    name: name,
                    email: email,
                    isOnline: true,
                    createdAt: new Date()
                });
            } catch (profileErr) {
                console.warn('Profile save warning:', profileErr);
            }

            // Redirect to chat
            window.location.href = 'index.html';
        }
    } catch (err) {
        console.error('Auth error:', err);
        let userMsg = err.message;

        if (err.code === 'auth/operation-not-allowed') {
            userMsg = '⚠️ Email/Password sign-in is disabled in your Firebase Console! Please go to Firebase Console > Authentication > Sign-in method > Enable Email/Password.';
        } else if (err.code === 'auth/email-already-in-use') {
            userMsg = 'This email is already registered. Please log in or use a different email.';
        } else if (err.code === 'auth/weak-password') {
            userMsg = 'Password is too weak. Please use at least 6 characters.';
        } else if (err.code === 'auth/invalid-email') {
            userMsg = 'Please enter a valid email address.';
        } else if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
            userMsg = 'Incorrect email or password.';
        } else if (err.code === 'auth/network-request-failed') {
            userMsg = 'Network error. Please check your internet connection.';
        }

        showError(userMsg);
        authBtn.disabled = false;
        authBtn.textContent = isLogin ? 'Log In' : 'Sign Up';
    }
});

// Auto-redirect if already logged in
auth.onAuthStateChanged((user) => {
    if (user) {
        console.log('User already signed in, redirecting to app...');
        window.location.href = 'index.html';
    }
});

