import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('build refuses to create a new identity when signing configuration is missing',()=>{
 const env={...process.env};delete env.ANDROID_SIGNING_FILE;
 const r=spawnSync('bash',['android/build.sh'],{env,encoding:'utf8'});
 assert.notEqual(r.status,0);assert.match(r.stderr,/Refusing to generate/);
});
test('invalid signing configuration fails without exposing secrets or producing an APK',()=>{
 const dir=mkdtempSync(join(tmpdir(),'gta-sign-test-'));
 try{
  const config=join(dir,'config.json');writeFileSync(config,JSON.stringify({password:'PRIVATE-SENTINEL',alias:'release',keystore_base64:'invalid!'}));
  const r=spawnSync('python3',['android/sign-apk.py',config,dir,'missing.apk',join(dir,'output.apk')],{encoding:'utf8'});
  assert.notEqual(r.status,0);assert.doesNotMatch(r.stderr+r.stdout,/PRIVATE-SENTINEL/);assert.match(r.stderr,/No fallback key/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
