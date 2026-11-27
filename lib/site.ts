export const siteName = "Naya Baazar";
export const siteOrigin = "https://www.nayabaazar.com";
export const siteLanguage = "en-IN";
export const developer = { name: "Defence Garden", url: "https://defencegarden.com/" };
export const enquiry = { href: "tel:+919917665577", display: "+91 99176 65577" };

export const routes = {
  home: "/",
  plans: "/floor-plans",
  details: "/project-details",
  walkthrough: "/walkthrough",
  gallery: "/gallery",
} as const;

export function siteUrl(path: string) {
  return new URL(path, siteOrigin).href;
}
