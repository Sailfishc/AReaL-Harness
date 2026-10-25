import contract from "./desktop-contract.cjs";
export const {
  commandDefinitions,
  commandSemantics,
  validateCommand,
  validatePreview,
  desktopError,
  validateMcpPageDeclaration,
  validateMcpPageCall,
  validateMcpPageReply,
} = contract;
/** @typedef {import('./desktop-contract.cjs').CommandName} CommandName */
/** @typedef {import('./desktop-contract.cjs').DesktopError} DesktopError */
/** @template T @typedef {import('./desktop-contract.cjs').DesktopResult<T>} DesktopResult */
/** @template {CommandName} N @typedef {import('./desktop-contract.cjs').CommandParams<N>} CommandParams */
/** @typedef {import('./desktop-contract.cjs').PreviewRequest} PreviewRequest */
/** @typedef {import('./desktop-contract.cjs').OwnedPreviewOperation} OwnedPreviewOperation */
/** @typedef {import('./desktop-contract.cjs').TrajectoryStatus} TrajectoryStatus */
/** @typedef {import('./desktop-contract.cjs').HistoryRequest} HistoryRequest */

/** @template {CommandName} N @template {CommandParams<N>} [P=CommandParams<N>] @typedef {import('./desktop-contract.cjs').CommandResponse<N,P>} CommandResponse */

/** @type {typeof import('./desktop-contract.cjs').validateCommandResponse} */
export const validateCommandResponse = contract.validateCommandResponse;
