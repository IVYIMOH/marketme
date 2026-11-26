import PhotoBanner from '@/components/PhotoBanner';
import PrivacyRequests from '@/components/PrivacyRequests';

export const metadata = { title: 'Privacy policy | NatuVara' };

export default function PrivacyPage() {
  const contact = process.env.PRIVACY_CONTACT_EMAIL;
  return (
    <>
      <PhotoBanner photoId="roller"><h1>Privacy policy</h1></PhotoBanner>
      <article className="policy-copy">
        <p>NatuVara uses account information to sign you in, publish photography you submit, and deliver purchases. You can browse the gallery without an account.</p>

        <h2>Your account</h2>
        <p>Supabase processes your email address, account identifier, sign-in method and session. It stores a password hash if you choose a password. If you use Google, Google handles your sign-in and shares your account identifier, email and basic profile information, which can include your name and profile picture. We use this information to create or recognize your account.</p>

        <h2>Photographer profiles and images</h2>
        <p>Your photographer display name, biography and verification level appear in the public directory. Your company is part of your private profile. Approved listings show the preview, title, category, location, lens information and price you submit. Choose a location description that you are comfortable making public.</p>
        <p>Supabase stores the original image, which can contain camera or location metadata. Moderators can review submissions, and a buyer who pays can download the original with that metadata. The upload form makes a separate preview from the image pixels. Remove sensitive metadata before submitting an original.</p>

        <h2>Purchases</h2>
        <p>We store your account and photo identifiers, invoice details, amount, status and timestamps to confirm Lightning payments and authorize downloads. LNbits processes the invoice, amount and payment status. Download links provide temporary access to the file for anyone holding the link.</p>

        <h2>Browser storage and service logs</h2>
        <p>Your browser stores your sign-in session and the sample photos you save. You can sign out and clear saved photos through your browser’s site-data settings. Our hosting and authentication providers may process IP addresses, request times and security events to operate the service and investigate faults.</p>

        <h2>Retention and your choices</h2>
        <p>Account, submission and purchase records are stored to operate your account and honor purchases. The app has no automatic deletion schedule. Infrastructure logs and backup copies follow the settings of the hosting provider. A request for deletion starts a review of your account, files and any transaction records that must be retained.</p>
        <p>Sign in to request a copy of your data or ask NatuVara to delete your account. We record your account identifier, request type and request date so the operator can respond using your account email.</p>
        <PrivacyRequests />
        {contact && <p>For corrections or help accessing your account, email <a href={`mailto:${contact}`}>{contact}</a>.</p>}
      </article>
    </>
  );
}
