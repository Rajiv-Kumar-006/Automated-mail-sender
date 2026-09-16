# Attachments Directory

Place your resume PDF file here (for example, `Resume.pdf`).

In your `.env` file:
```env
ATTACH_RESUME=true
RESUME_FILE_PATH=./attachments/Resume.pdf
RESUME_DISPLAY_NAME=Your_Name_Resume.pdf
```

If `ATTACH_RESUME=true` and the file exists, the mailer will automatically attach it to every outgoing email.
If the file does not exist or `ATTACH_RESUME=false`, emails will be sent without attachments.
