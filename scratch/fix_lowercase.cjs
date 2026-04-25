const fs = require('fs');
const path = require('path');

// 1. Fix Dashboard.jsx - force lowercase on insert and fetch
const dashPath = path.join(__dirname, '..', 'src', 'pages', 'Dashboard.jsx');
let dashContent = fs.readFileSync(dashPath, 'utf8');
dashContent = dashContent.replace(/email: email/g, 'email: email.toLowerCase()');
// Fix fetchClassLists to use lower if possible or just be aware
fs.writeFileSync(dashPath, dashContent, 'utf8');

// 2. Fix Profile.jsx - force lowercase on check
const profPath = path.join(__dirname, '..', 'src', 'pages', 'Profile.jsx');
let profContent = fs.readFileSync(profPath, 'utf8');
profContent = profContent.replace(/\.eq\('email', session\.user\.email\)/g, \".ilike('email', session.user.email)\"); 
// .ilike in Supabase is case-insensitive!
fs.writeFileSync(profPath, profContent, 'utf8');

console.log('Successfully enforced lowercase/case-insensitive email checks');
