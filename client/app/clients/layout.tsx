import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Clients",
};

export default function ClientsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
