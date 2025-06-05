const path = require('path');

// Vercel에서 상위 폴더 파일 가져오기
let handler;
try {
  // 프로덕션 환경에서는 절대 경로 사용
  const tourismModule = require(path.join(process.cwd(), 'tourism.js'));
  handler = tourismModule.default || tourismModule.handler || tourismModule;
} catch (error) {
  console.error('Failed to load tourism module:', error);
  // 폴백으로 상대 경로 시도
  try {
    const tourismModule = require('../tourism.js');
    handler = tourismModule.default || tourismModule.handler || tourismModule;
  } catch (fallbackError) {
    console.error('Fallback also failed:', fallbackError);
    throw new Error('Cannot load tourism module');
  }
}

module.exports = async (req, res) => {
  try {
    if (typeof handler === 'function') {
      await handler(req, res);
    } else {
      throw new Error('Handler is not a function');
    }
  } catch (error) {
    console.error('API Handler Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
};
