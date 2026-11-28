import type { Dict } from "./id";

/**
 * English dictionary. `satisfies Dict` menolak kunci yang hilang atau
 * berlebih, jadi tidak mungkin lupa menerjemahkan satu string pun.
 *
 * Tone: same as Indonesian — active voice, concrete numbers, never blame the
 * user, never promise safety we cannot deliver.
 */
export const en = {
  meta: {
    homeTitle: "Jangkau — disaster reports you can act on",
    homeDescription:
      "Residents report disasters where they are, the community backs them, verified distributors take over, and every rupiah can be traced.",
    eventTitleSuffix: "Jangkau",
    accountTitle: "My account — Jangkau",
    uploadTitle: "Upload a disaster report — Jangkau",
    signInTitle: "Sign in — Jangkau",
    signUpTitle: "Sign up — Jangkau",
  },

  nav: {
    home: "Home",
    leaderboard: "Leaderboard",
    pantau: "Monitoring",
    upload: "Upload",
    account: "Account",
    signIn: "Sign in",
    signUp: "Sign up",
    signOut: "Sign out",
    openMenu: "Open menu",
    closeMenu: "Close menu",
  },

  common: {
    loading: "Loading…",
    loadingSession: "Loading session…",
    retry: "Try again",
    close: "Close",
    backToHome: "Back to home",
    locationUnknown: "Location not given",
    noPhoto: "No photo yet",
    justNow: "just now",
    errorTitle: "Something went wrong",
    errorDetail: "This page failed to load.",
    notFoundTitle: "Page not found",
    notFoundDetail: "The address you opened does not exist.",
    loadFailed: "Failed to load data",
  },

  footer: {
    tagline: "Jangkau — aid that lands where it is needed.",
    demoNote: "Demo data. Fund disbursement is simulated.",
  },

  preferences: {
    language: "Language",
    theme: "Theme",
    themeDark: "Dark",
    themeLight: "Light",
    themeSystem: "Match device",
    saved: "Preferences saved",
    saveFailed: "Preferences were not saved to your account, but still apply on this device",
  },

  feed: {
    leaderboardTitle: "Leaderboard",
    pantauTitle: "Monitoring",
    terbaruTitle: "Latest",
    leaderboardHint: "Reports that passed the support threshold and are ready for a distributor.",
    pantauHint:
      "A person in charge is already assigned. Shelter needs and purchase receipts are public.",
    terbaruHint: "Latest reports from residents on the ground.",
    leaderboardEmpty: "No report has passed the support threshold yet.",
    pantauEmpty: "No report has a person in charge yet.",
    terbaruEmpty: "No reports yet. Be the first to report.",
    seeAll: "See all",
    supportLabel: "supporters",
    reporterLabel: "reporters",
    poskoLabel: "shelters",
    hasPic: "Person in charge assigned · {count}",
    noPic: "No person in charge yet",
    photoAlt: "Photo of {title}",
    sectionLeaderboard: "LEADERBOARD",
    sectionPantau: "MONITORING",
    sectionTerbaru: "LATEST",
    homeTitle: "Aid that reaches the right place.",
    homeIntro:
      "Residents report disasters around them. Reports about the same event merge into one story, then gather support together. Once a verified person in charge steps in, shelter needs and spending become public.",
    loadMore: "Load more",
  },

  event: {
    reportedAt: "reported {time}",
    support: "Support",
    supported: "Supported",
    reportersAndPosko: "{reporters} reporters · {posko} shelters",
    reportersTitle: "Who reported",
    uploaderLine: "{name} · {count} posts",
    picTitle: "People in charge of distribution",
    picEmpty: "No person in charge yet. This report is still gathering support.",
    labelOrganization: "Disaster response organization",
    labelVolunteer: "Volunteer",
    labelCreator: "Creator",
    verified: "Verified",
    raised: "Raised",
    disbursed: "Disbursed",
    donorCount: "Donors",
    poskoCount: "Shelters",
    poskoTitle: "Shelters",
    poskoEmpty: "Shelter needs open once the person in charge completes the survey.",
    headcount: "{count} displaced",
    capacity: "capacity {count}",
    addressEmpty: "Address not provided",
    signInToSupport: "Sign in to support this report.",
    kindPantau: "MONITORING",
  },

  upload: {
    title: "Upload a disaster report",
    intro:
      "Location comes from your device and is required. Reports about the same disaster merge into one story.",
    bodyLabel: "What happened?",
    bodyPlaceholder:
      "Example: Floodwater hit at 2 am, three hamlets submerged, residents moved to the village hall. We need clean water and blankets.",
    placeLabel: "Place name (optional)",
    placePlaceholder: "Krajan hamlet, Kromengan",
    photosLabel: "Photos (up to 4)",
    photosHint:
      "Photos are compressed on your device before upload. Do not photograph identifiable faces.",
    submit: "Send report",
    submitting: "Sending…",
    statusLocating: "Getting your location…",
    statusUploading: "Uploading {count} photos…",
    statusSending: "Sending report…",
    signInRequired: "Sign in first to upload a disaster report.",
    geolocationFailed: "Location unavailable. Allow location access and try again.",
    incomplete: "The report is incomplete",
    successMerged: "Your report was merged into an existing story.",
    successNew: "Your report was published as a new story.",
  },

  account: {
    title: "My account",
    roleResident: "Resident",
    roleDistributor: "Aid distributor",
    roleAdmin: "Admin",
    badgesTitle: "Badges",
    badgesEmpty:
      "No badges yet. Upload a disaster report to earn the Reporter badge, or donate to earn the Donor badge.",
    badgeReporter: "Reporter",
    badgeFunder: "Donor",
    distributorTitle: "Distributor profile",
    distributorVerified: "You can apply to be a person in charge of distribution.",
    distributorPending: "Applications open once an admin approves your verification.",
    distributorRejection: "Admin note: {reason}",
    verificationUnverified: "Not verified",
    verificationPending: "Waiting for admin review",
    verificationVerified: "Verified",
    verificationRejected: "Rejected",
    verificationSuspended: "Suspended",
  },

  auth: {
    signInTitle: "Sign in",
    signInIntro: "Residents and aid distributors use the same door.",
    signUpTitle: "Create an account",
    signUpIntro: "Pick your main role. Both can report disasters and donate.",
    email: "Email",
    password: "Password",
    fullName: "Full name",
    phone: "Phone number",
    phonePlaceholder: "08xx",
    signIn: "Sign in",
    signUp: "Sign up",
    withGoogle: "Sign in with Google",
    or: "or",
    noAccount: "No account yet?",
    hasAccount: "Already have an account?",
    processing: "Working…",
    checkEmailTitle: "Check your email",
    checkEmailBody: "A confirmation link was sent to {email}. Once confirmed, you can sign in and start reporting.",
    goToSignIn: "Go to sign in",
    supabaseMissing:
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in apps/web/.env.",
    accountTypeLegend: "I am signing up as",
    accountTypeResident: "Resident",
    accountTypeResidentHint: "Report disaster conditions around you and help by donating.",
    accountTypeDistributor: "Aid Distributor",
    accountTypeDistributorHint: "Manage shelters and deliver aid to disaster sites.",
    accountTypeNote:
      "Both can report disasters and donate. Aid distributors can apply to be a person in charge once verified.",
    labelLegend: "Distributor type",
    labelOrganization: "Disaster Response Organization",
    labelOrganizationHint: "Prepare the deed, legal decree, and PIC identity card",
    labelVolunteer: "Volunteer",
    labelVolunteerHint: "Prepare your ID and proof of field activity",
    labelCreator: "Creator",
    labelCreatorHint: "Prepare social links and follower statistics",
    signInFailed: "Sign in failed",
    signUpFailed: "Sign up failed",
    googleFailed: "Google sign in failed",
  },

  guards: {
    unverifiedTitle: "Distributor verification not approved yet",
    unverifiedBody:
      "Complete your documents in the distributor dashboard and wait for admin approval. Once you carry the verified check, you can apply to be a person in charge of distribution.",
  },
} as const satisfies Dict;
