export const presets = {
  standard: {length:20,lower:true,upper:true,numbers:true,symbols:true,ambiguous:false},
  strong: {length:32,lower:true,upper:true,numbers:true,symbols:true,ambiguous:false},
  readable: {length:24,lower:true,upper:true,numbers:true,symbols:false,ambiguous:true},
};
export function editEntry(entry, changes, now = new Date().toISOString()) {
  changes = {...changes,website:changes.website ?? entry.website ?? ''};
  if (['name','username','password'].every(k => entry[k] === changes[k]) && (entry.website || '') === changes.website) return entry;
  const previous = {name:entry.name,username:entry.username,password:entry.password,website:entry.website || '',updatedAt:entry.updatedAt ?? null,archivedAt:now};
  return {...entry,...changes,updatedAt:now,history:[previous,...(entry.history || [])].slice(0,20)};
}
export function restoreVersion(entry, index) {
  const previous = entry.history?.[index];
  if (!previous) throw new Error('This version is no longer available.');
  return editEntry(entry,{name:previous.name,username:previous.username,password:previous.password,website:previous.website || ''});
}
