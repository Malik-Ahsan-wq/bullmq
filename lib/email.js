const nodemailer = require("nodemailer");

let cachedTransport = null;

async function getTransport() {
  if (cachedTransport) {
    return cachedTransport;
  }

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    throw new Error(
      "SMTP credentials not configured. Set SMTP_USER and SMTP_PASS in .env.local"
    );
  }

  cachedTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: false,
    auth: {
      user: user,
      pass: pass.replace(/\s/g, ""),
    },
    tls: {
      rejectUnauthorized: false,
    },
  });

  await cachedTransport.verify();
  console.log("Gmail SMTP connected successfully");

  return cachedTransport;
}

async function sendInviteEmail({ email, projectName, inviterName, token }) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const inviteLink = `${baseUrl}/invite/${token}`;

  const transport = await getTransport();
  const fromAddress = process.env.SMTP_USER;

  const mailOptions = {
    from: `"Todo App" <${fromAddress}>`,
    to: email,
    subject: `You've been invited to join "${projectName}"`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.1);overflow:hidden;">
                <tr>
                  <td style="background:linear-gradient(135deg,#0070f3,#0051a8);padding:30px;text-align:center;">
                    <h1 style="color:white;margin:0;font-size:24px;">Project Invitation</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding:30px;">
                    <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 20px 0;">
                      <strong style="color:#0070f3;">${inviterName}</strong> has invited you to join the project:
                    </p>
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;border-radius:8px;border:1px solid #e9ecef;margin-bottom:25px;">
                      <tr>
                        <td style="padding:20px;">
                          <h2 style="margin:0 0 5px 0;font-size:20px;color:#333;">${projectName}</h2>
                          <p style="margin:0;color:#666;font-size:14px;">Click below to accept and join this project</p>
                        </td>
                      </tr>
                    </table>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center">
                          <a href="${inviteLink}" style="display:inline-block;background:#0070f3;color:white;text-decoration:none;padding:16px 40px;border-radius:8px;font-weight:bold;font-size:16px;">Accept Invitation</a>
                        </td>
                      </tr>
                    </table>
                    <p style="color:#999;font-size:12px;text-align:center;margin-top:25px;">
                      This invitation will expire in 7 days.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="background:#f8f9fa;padding:20px;border-top:1px solid #e9ecef;">
                    <p style="color:#999;font-size:12px;text-align:center;margin:0;">
                      If you didn't expect this invitation, you can safely ignore this email.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
    text: `${inviterName} has invited you to join "${projectName}". Accept here: ${inviteLink}`,
  };

  const info = await transport.sendMail(mailOptions);
  return info;
}

/**
 * Sends a deadline reminder email for a task that is approaching its deadline.
 * Called by the deadline worker when a delayed job fires.
 */
async function sendDeadlineReminder({
  email,
  taskName,
  projectName,
  deadline,
  assigneeName,
  creatorName,
}) {
  const transport = await getTransport();
  const fromAddress = process.env.SMTP_USER;

  const deadlineDate = new Date(deadline);
  const formattedDeadline = deadlineDate.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const recipientName = assigneeName || creatorName || "there";

  const mailOptions = {
    from: `"Todo App" <${fromAddress}>`,
    to: email,
    subject: `⏰ Deadline Reminder: "${taskName}" is due now`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.1);overflow:hidden;">
                <tr>
                  <td style="background:linear-gradient(135deg,#dc2626,#b91c1c);padding:30px;text-align:center;">
                    <h1 style="color:white;margin:0;font-size:24px;">⏰ Deadline Reminder</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding:30px;">
                    <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 20px 0;">
                      Hi <strong>${recipientName}</strong>,
                    </p>
                    <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 20px 0;">
                      The following task has reached its deadline:
                    </p>
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border-radius:8px;border:1px solid #fecaca;margin-bottom:25px;">
                      <tr>
                        <td style="padding:20px;">
                          <h2 style="margin:0 0 8px 0;font-size:18px;color:#991b1b;">${taskName}</h2>
                          ${projectName ? `<p style="margin:0 0 4px 0;color:#666;font-size:14px;">Project: <strong>${projectName}</strong></p>` : ""}
                          <p style="margin:0;color:#666;font-size:14px;">Deadline: <strong>${formattedDeadline}</strong></p>
                        </td>
                      </tr>
                    </table>
                    <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 20px 0;">
                      Please complete this task as soon as possible.
                    </p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center">
                          <a href="${baseUrl}/todos" style="display:inline-block;background:#dc2626;color:white;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:bold;font-size:15px;">View Task</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="background:#f8f9fa;padding:20px;border-top:1px solid #e9ecef;">
                    <p style="color:#999;font-size:12px;text-align:center;margin:0;">
                      This is an automated reminder from Todo App. You can manage your notification preferences in your account settings.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
    text: `Hi ${recipientName},\n\nThe task "${taskName}"${projectName ? ` in project "${projectName}"` : ""} has reached its deadline (${formattedDeadline}). Please complete it as soon as possible.\n\nView your tasks: ${baseUrl}/todos`,
  };

  const info = await transport.sendMail(mailOptions);
  return info;
}

/**
 * Sends a login notification email to the user.
 * Called by the login worker when a user successfully logs in.
 */
async function sendLoginNotification({ email, name, loginTime, ip }) {
  const transport = await getTransport();
  const fromAddress = process.env.SMTP_USER;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const formattedTime = new Date(loginTime).toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });

  const recipientName = name || "there";

  const mailOptions = {
    from: `"Todo App" <${fromAddress}>`,
    to: email,
    subject: "Login Notification - Todo App",
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.1);overflow:hidden;">
                <tr>
                  <td style="background:linear-gradient(135deg,#10b981,#059669);padding:30px;text-align:center;">
                    <h1 style="color:white;margin:0;font-size:24px;">Login Successful</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding:30px;">
                    <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 20px 0;">
                      Hi <strong>${recipientName}</strong>,
                    </p>
                    <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 20px 0;">
                      We're confirming your recent login to Todo App:
                    </p>
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0;margin-bottom:25px;">
                      <tr>
                        <td style="padding:20px;">
                          <h2 style="margin:0 0 8px 0;font-size:18px;color:#166534;">Account Accessed</h2>
                          <p style="margin:0 0 4px 0;color:#666;font-size:14px;">Email: <strong>${email}</strong></p>
                          <p style="margin:0 0 4px 0;color:#666;font-size:14px;">Login Time: <strong>${formattedTime}</strong></p>
                          ${ip ? `<p style="margin:0;color:#666;font-size:14px;">IP Address: <strong>${ip}</strong></p>` : ""}
                        </td>
                      </tr>
                    </table>
                    <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 20px 0;">
                      If this wasn't you, please change your password immediately and contact support.
                    </p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center">
                          <a href="${baseUrl}/todos" style="display:inline-block;background:#10b981;color:white;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:bold;font-size:15px;">Go to Dashboard</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="background:#f8f9fa;padding:20px;border-top:1px solid #e9ecef;">
                    <p style="color:#999;font-size:12px;text-align:center;margin:0;">
                      This is a security notification from Todo App. You can manage your notification preferences in your account settings.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
    text: `Hi ${recipientName},\n\nWe're confirming your recent login to Todo App.\n\nEmail: ${email}\nLogin Time: ${formattedTime}\n${ip ? `IP Address: ${ip}\n` : ""}\nIf this wasn't you, please change your password immediately.\n\nGo to Dashboard: ${baseUrl}/todos`,
  };

  const info = await transport.sendMail(mailOptions);
  return info;
}

module.exports = { getTransport, sendInviteEmail, sendDeadlineReminder, sendLoginNotification };
