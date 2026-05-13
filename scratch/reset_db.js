import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

async function reset() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    // Reset account
    await mongoose.connection.collection('accounts').updateOne({}, { 
      $set: { balance: 200000, totalPnl: 0, tradesCount: 0 } 
    }, { upsert: true });
    
    // Clear history
    await mongoose.connection.collection('trades').deleteMany({});
    await mongoose.connection.collection('automationstates').deleteMany({});
    
    console.log('Database reset successfully to 200,000');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

reset();
