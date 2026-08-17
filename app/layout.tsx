import type {Metadata} from "next";import "./globals.css";
export const metadata:Metadata={title:"Sermon Register",description:"A private register for Lehr and Gebet services."};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
