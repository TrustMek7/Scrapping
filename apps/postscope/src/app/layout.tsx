import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PostScope | Captura local de Facebook",
  description: "Piloto local para obtener una publicación de Facebook por URL.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
