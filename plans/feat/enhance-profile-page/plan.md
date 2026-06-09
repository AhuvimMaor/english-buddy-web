# Plan: Enhance Profile Page

## What
Upgrade the `/profile` page in `english-buddy-web` to allow users to edit their profile details. Specifically:
1. Update `displayName`.
2. Update `englishLevel` (beginner, intermediate, advanced).
3. Upload and display a profile picture (`photoURL`).

## Why
Currently, the profile page is read-only except for toggling the `isOnline` status. Users need to be able to personalize their accounts and update their language proficiency level. 

## How
- Modify `src/app/profile/page.tsx`.
- Add state variables for `isEditing`, `editName`, `editLevel`.
- Add a file input for profile picture uploads.
- When saving, update the user document in Firestore (`users/{uid}`).
- Handle image upload to Firebase Storage (`users/{uid}/profile_pic`) and store the download URL in `photoURL`.
- Use existing Tailwind and CSS variables for styling.

## Files to Change
- `src/app/profile/page.tsx`
- Ensure Firebase Storage is properly imported and used (`@/lib/firebase`).

## Definition of Done
- User can toggle "Edit Profile".
- User can change their name and English level.
- User can upload an image, which appears in the avatar circle.
- Changes persist to Firestore and Firebase Storage.