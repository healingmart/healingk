const path = require('path');

// 안전한 모듈 로딩
let healthCheck;
try {
  const tourismModule = require(path.join(process.cwd(), 'tourism.js'));
  healthCheck = tourismModule.healthCheck;
} catch (error) {
  console.error('Failed to load tourism module for health check:', error);
  try {
    const tourismModule = require('../tourism.js');
    healthCheck = tourismModule.healthCheck;
  } catch (fallbackError) {
    console.error('Fallback health check load failed:', fallbackError);
  }
}

module.exports = async (req, res) => {
  try {
    // CORS 헤더 설정
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    let health;
    
    if (healthCheck && typeof healthCheck === 'function') {
      health = await healthCheck();
    } else {
      // 기본 헬스체크
      health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.2.0',
        environment: process.env.NODE_ENV || 'production',
        apiKeyConfigured: !!(process.env.TOURISM_API_KEY),
        node: process.version,
        platform: process.platform,
        uptime: process.uptime(),
        memory: process.memoryUsage()
      };
    }

    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);

  } catch (error) {
    console.error('Health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString(),
      version: '1.2.0'
    });
  }
};
