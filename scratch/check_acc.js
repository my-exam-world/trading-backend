import mongoose from 'mongoose';
import { Account } from '../src/models/Account.js';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const acc = await Account.findOne();
  console.log('CURRENT ACCOUNT:', acc);
  process.exit();
}
check();
