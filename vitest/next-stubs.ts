import React from "react";

export const useRouter = () => ({
  push: () => undefined,
  replace: () => undefined,
  refresh: () => undefined,
  back: () => undefined,
  forward: () => undefined,
  prefetch: () => undefined,
});

export const usePathname = () => "/";
export const redirect = () => {
  throw new Error("redirect() is not supported in Vitest");
};
export const permanentRedirect = () => {
  throw new Error("permanentRedirect() is not supported in Vitest");
};
export const notFound = () => {
  throw new Error("notFound() is not supported in Vitest");
};

export const headers = () => new Headers();

const Link = ({ children, href, ...props }: any) =>
  React.createElement("a", { href: typeof href === "string" ? href : "#", ...props }, children);

export default Link;
