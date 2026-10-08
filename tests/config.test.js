import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultEndpoint,chooseEndpoint} from '../config.js';
test('新裝置與無痕視窗使用預設服務；保留既有資料來源及待處理操作',()=>{
 assert.equal(chooseEndpoint(null),defaultEndpoint);
 assert.equal(chooseEndpoint({endpoint:''}),defaultEndpoint);
 const stored={endpoint:'https://script.google.com/macros/s/existing/exec',pending:{id:'pending-original'},drafts:{K:{delta:1}}};
 const before=JSON.stringify(stored);
 assert.equal(chooseEndpoint(stored),stored.endpoint);
 assert.equal(JSON.stringify(stored),before);
 assert.equal(new URL(defaultEndpoint).origin,'https://script.google.com');
});
