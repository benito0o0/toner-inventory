import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compareModels} from '../models.js';
test('位數優先，再依數值排序；保留英文字母後綴',()=>{
 assert.deepEqual(['3212','99','2020','325Z','20','2022'].sort(compareModels),['20','99','325Z','2020','2022','3212']);
 assert.deepEqual(['02','9','325Z','325A','325'].sort(compareModels),['9','02','325','325A','325Z']);
});
test('長數字不損失精度，全形數字可比較，純文字保持自然排序',()=>{
 assert.ok(compareModels('99999999999999999999','99999999999999999998')>0);
 assert.ok(compareModels('２０','99')<0);
 assert.deepEqual(['Z','A','3212'].sort(compareModels),['3212','A','Z']);
});
