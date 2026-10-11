// Start the permission request during the click, while the worker stages setup.
// An unpacked extension can load a new popup before its old worker is reloaded.
export async function configureApp(app,{send,requestPermission}) {
  const setup=send({type:'prepare-configure',app}).then(()=>null,error=>error);
  const granted=await requestPermission({origins:[new URL(app).origin+'/*']});
  if(!granted)throw new Error('Permission was not granted. Keykeep needs access to its own host to receive the login.');
  const error=await setup;
  if(error && error.message!=='Unknown request.')throw error;
  await send({type:'configure',app});
}
