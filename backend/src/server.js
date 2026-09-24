const path = require('path');
const requestId = require('./middleware/requestId');
const { corsOptions, apiLimiter } = require('./config/security');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const connectDB = require('./config/db');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');

if (!process.env.MONGO_URI || !process.env.JWT_SECRET) {
  console.error('MONGO_URI and JWT_SECRET are required');
  process.exit(1);
}

const app = express();
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);

app.use(requestId);
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(cors(corsOptions()));
app.use(express.json({ limit: '2mb' }));

// College logos, banners, student photos and employee photos are public application media.
// Allow the frontend dev origin to render them without Helmet blocking cross-origin images.
app.use('/uploads', (req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(path.join(process.cwd(), 'uploads')));

app.use('/api/system', require('./modules/system/routes'));
app.use('/api', apiLimiter);
app.use(morgan('dev'));
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
app.use('/api', routes);
app.use(errorHandler);

const port = Number(process.env.PORT || 5000);
connectDB()
  .then(() => app.listen(port, () => console.log(`College CMS API on ${port}`)))
  .catch(e => { console.error(e); process.exit(1); });
