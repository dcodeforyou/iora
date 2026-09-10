import type { Metadata } from "next";
import Nav from "@/components/site/Nav";
import BookExperience from "@/components/book/BookExperience";

export const metadata: Metadata = {
  title: "Book a call — ïora",
  description:
    "Share a few details so we can come prepared and make our time together actually useful.",
};

export default function BookPage() {
  return (
    <>
      <Nav />
      <BookExperience />
    </>
  );
}
