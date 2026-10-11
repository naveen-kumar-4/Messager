// auth.js - Login & Registration Logic (Firebase Compat style)

let isLogin = true;

const toggleLink = document.getElementById('auth-toggle-link');
const authTitle = document.getElementById('auth-title');
const authBtn = document.getElementById('auth-btn');
const authSwitchText = document.getElementById('auth-switch-text');
const nameGroup = document.getElementById('name-group');
const inviteGroup = document.getElementById('invite-group');
const authForm = document.getElementById('auth-form');

// Toggle between Login and Sign Up UI
toggleLink.addEventListener('click', () => {
    isLogin = !isLogin;
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
                    createdAt: new Date()
                });
            }

            window.location.href = 'index.html';

        } else {
            // --- SIGN UP ---
            const name = document.getElementById('name').value.trim();
            const inviteCode = document.getElementById('invite-code').value.trim();

            // Verify invite code
            const inviteDoc = await db.collection('invites').doc(inviteCode).get();
            if (!inviteDoc.exists) {
                throw new Error('Invalid invite code! Ask the admin for the code.');
            }

            // Create the account
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;

            // Save profile BEFORE redirecting
            await db.collection('users').doc(user.uid).set({
                uid: user.uid,
                name: name,
                email: email,
                createdAt: new Date()
            });

            // Now redirect
            window.location.href = 'index.html';
        }
    } catch (err) {
        alert('Error: ' + err.message);
        authBtn.disabled = false;
        authBtn.textContent = isLogin ? 'Log In' : 'Sign Up';
    }
});
