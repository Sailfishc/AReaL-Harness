/** @param {string} patch @returns {string[]} */
export function splitCloudPatch(patch) {
  // 复用的 PatchDiff 一次只接收一个文件；hunk 内容行自带前缀，不会误识别为文件边界。
  return patch.split(/(?=^diff --git )/m).filter((part) => part.trim());
}
/** @template {{id:string,sequence:number}} T @param {T|undefined} current @param {T} incoming @param {string} owner @returns {T|undefined} */
export function projectCloudTask(current, incoming, owner) {
  if (incoming.id !== owner || (current?.id === owner && current.sequence >= incoming.sequence))
    return current;
  return incoming;
}
