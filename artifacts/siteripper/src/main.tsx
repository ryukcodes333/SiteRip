import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

createRoot(document.getElementById("root")!).render(<App basePath={basePath} />);
