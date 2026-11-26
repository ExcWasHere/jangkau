import { OrganizationStatusPage } from "~/features/organizations/status-page";

export function meta() {
  return [{ title: "Organization status — Jangkau" }];
}

export default function Route() {
  return <OrganizationStatusPage />;
}
