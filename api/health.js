// 절대 경로로 tourism.js 찾기
const path = require('path');

let healthCheck;
try {
  // Vercel에서 루트 tourism.js 파일 찾기
  const tourismPath = path.join(process.cwd(), 'tourism.js');
  const tourismModule = require(tourismPath);
  healthCheck = tourismModule.healthCheck;
} catch (error) {
  console.error('Failed to load tourism.js:', error);
  healthCheck = null;
}

module.exports = async (req, res) => {
  try {
    // CORS 헤더
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
      // 기본 헬스체크 (tourism.js 로드 실패 시)
      health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.2.0',
        environment: process.env.NODE_ENV || 'production',
        apiKeyConfigured: !!(process.env.TOURISM_API_KEY),
        node: process.version,
        platform: process.platform,
        uptime: process.uptime(),
        memory: {
          rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
          heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
        },
        note: 'Basic health check (tourism.js module loading issue)'
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
