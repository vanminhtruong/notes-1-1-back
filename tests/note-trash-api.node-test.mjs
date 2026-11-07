import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { sequelize, User, Note, NoteTrash } from '../src/models/index.js';
import app from '../src/app.js';

assert.equal(process.env.NODE_ENV,'test');
process.env.JWT_SECRET='trash-test-only';
await sequelize.sync({force:true});
try {
 const owner=await User.create({email:'owner@trash-test.example',name:'Owner Test',password:'password123'});
 const other=await User.create({email:'other@trash-test.example',name:'Other Test',password:'password123'});
 const admin=await User.create({email:'admin@trash-test.example',name:'Admin Test',password:'password123',role:'admin',adminLevel:'super_admin'});
 const bearer=(u)=>'Bearer '+jwt.sign({id:u.id},process.env.JWT_SECRET);
 const note=await Note.create({title:'Private test note',content:'Private content',userId:owner.id});
 let res=await request(app).delete('/api/v1/notes/'+note.id).set('Authorization',bearer(owner));
 assert.equal(res.status,200,JSON.stringify(res.body));
 assert.equal(await Note.count(),0);
 let ownerList=await request(app).get('/api/v1/notes/trash').set('Authorization',bearer(owner));
 assert.equal(ownerList.status,200);
 assert.equal(ownerList.body.notes.length,1);
 let otherList=await request(app).get('/api/v1/notes/trash').set('Authorization',bearer(other));
 assert.equal(otherList.body.notes.length,0);
 const trashId=ownerList.body.notes[0].id;
 let denied=await request(app).delete('/api/v1/notes/trash/'+trashId).set('Authorization',bearer(other));
 assert.equal(denied.status,404);
 let adminList=await request(app).get('/api/v1/admin/notes-trash').set('Authorization',bearer(admin));
 assert.equal(adminList.status,200,JSON.stringify(adminList.body));
 assert.equal(adminList.body.notes.length,1);
 let restored=await request(app).post('/api/v1/notes/trash/'+trashId+'/restore').set('Authorization',bearer(owner));
 assert.equal(restored.status,200,JSON.stringify(restored.body));
 assert.equal((await Note.findByPk(note.id)).title,'Private test note');
 assert.equal(await NoteTrash.count(),0);
 console.log('PASS: authenticated user & admin routes, owner isolation, delete and restore');
} finally { await sequelize.close(); }
