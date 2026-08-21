var db=require("better-sqlite3")("/home/ubuntu/octal-backend/data/octal_dialer.db");

// Link blazingsoul451@gmail.com to the existing admin account
db.prepare("UPDATE users SET email = ? WHERE username = ?").run("blazingsoul451@gmail.com", "admin");

// Verify
var r=db.prepare("SELECT id,username,email,googleId,authProvider FROM users").all();
console.log("UPDATED USERS:");
console.log(JSON.stringify(r,null,2));
