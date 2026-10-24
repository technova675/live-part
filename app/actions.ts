"use server";

import { updateTag } from "next/cache";

export async function refreshDashboardData() {
  updateTag("authors");
  updateTag("paid-promotion-posts");
  updateTag("creator-pricing");
}
