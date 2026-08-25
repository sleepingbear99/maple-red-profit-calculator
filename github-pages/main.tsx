import { createRoot } from "react-dom/client";
import Calculator from "../app/page";
import "../app/globals.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Calculator root element was not found.");
}

createRoot(root).render(<Calculator />);
