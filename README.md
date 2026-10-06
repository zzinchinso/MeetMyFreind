# MeetMyFriends

## Applicant history and profile management

The public page supports application history lookup with the applicant's name, mobile number, and a password set during submission. Applicants can open any matching application, edit it (the existing spreadsheet row is updated), or withdraw it (the row's status becomes `철회`). Passwords are stored as salted, iterated HMAC hashes in the `비밀번호솔트` and `비밀번호해시` columns; the raw password is not saved.

### Deploying the Apps Script update

The frontend and `server/Code.gs` must be deployed together. The repository does not contain a linked Apps Script project, so publishing the GitHub Pages files alone will not update the form backend.

1. Open the Google Sheet's linked Apps Script project and replace its code with `server/Code.gs`.
2. Run `setup()` once. Existing application rows are preserved; the two password-hash columns are added automatically.
3. In **Deploy → Manage deployments**, edit the existing web app deployment, select **New version**, and deploy so its URL stays the same.
4. Open the web app URL and confirm its JSON response includes `accountAccess: true`.
5. Publish the site changes to GitHub Pages.

Applicants who still have their previous receipt open in that browser can open **내 정보 보기** and set a password from the profile screen. An applicant without that receipt must use the account recovery channel provided by the operator; name and phone alone are not accepted as proof of ownership.
