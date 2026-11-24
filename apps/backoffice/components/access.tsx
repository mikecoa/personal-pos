"use client";
import { createContext, useContext, type ReactNode } from "react";

/**
 * Whether the person may change the page they're on (their role's backoffice "change" access;
 * never while previewing a role). Set by the app layout. Editors, switches and "New …" buttons
 * read it, so a view-only page shows everything but changes nothing. The database checks again.
 */
const Access = createContext(true);

export function AccessProvider({ canWrite, children }: { canWrite: boolean; children: ReactNode }) {
  return <Access.Provider value={canWrite}>{children}</Access.Provider>;
}

export const useCanWrite = () => useContext(Access);

/** Shows its children only to people who may change this page (e.g. "New item"). */
export function WriteOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  return <>{useCanWrite() ? children : fallback}</>;
}

/** Disables every field inside when the page is view-only (for forms that aren't an EditorForm). */
export function WriteFieldset({ children, readOnly }: { children: ReactNode; readOnly?: boolean }) {
  const can = useCanWrite() && !readOnly;
  return <fieldset disabled={!can} className="contents">{children}</fieldset>;
}
