const axios = require('axios');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // OPTIONS 요청 처리
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const region = req.query.region || '서울';
        const apiKey = process.env.WEATHER_API_KEY;

        // 디버깅 로그
        console.log('날씨 API 요청:', {
            region,
            apiKeyExists: !!apiKey,
            timestamp: new Date().toISOString()
        });

        if (!apiKey) {
            console.warn('⚠️ WEATHER_API_KEY 환경 변수가 설정되지 않았습니다.');
            return res.json({
                success: true,
                data: {
                    region,
                    temperature: 20,
                    sky: '맑음',
                    precipitation: '없음',
                    message: '⚠️ API 키 설정 필요 - 샘플 데이터',
                    time: new Date().toLocaleString('ko-KR')
                }
            });
        }

        // 확장된 좌표 매핑
        const coordinates = {
            '서울': { nx: 60, ny: 127 },
            '부산': { nx: 98, ny: 76 },
            '제주': { nx: 52, ny: 38 },
            '강릉': { nx: 92, ny: 131 },  // 강원도 강릉
            '전주': { nx: 63, ny: 89 },   // 전북 전주
            '대구': { nx: 89, ny: 90 },   // 대구
            '광주': { nx: 58, ny: 74 },   // 광주
            '대전': { nx: 67, ny: 100 }   // 대전
        };

        const coord = coordinates[region] || coordinates['서울'];
        console.log('좌표 정보:', { region, coord });

        // 날짜/시간 설정 개선
        const now = new Date();
        const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
        const baseDate = kst.toISOString().slice(0, 10).replace(/-/g, '');
        
        // 발표 시각 계산 (기상청은 3시간마다 발표: 02, 05, 08, 11, 14, 17, 20, 23시)
        const currentHour = kst.getHours();
        let baseTime;
        if (currentHour >= 23 || currentHour < 2) baseTime = '2300';
        else if (currentHour < 5) baseTime = '0200';
        else if (currentHour < 8) baseTime = '0500';
        else if (currentHour < 11) baseTime = '0800';
        else if (currentHour < 14) baseTime = '1100';
        else if (currentHour < 17) baseTime = '1400';
        else if (currentHour < 20) baseTime = '1700';
        else baseTime = '2000';

        console.log('API 요청 파라미터:', {
            baseDate,
            baseTime,
            nx: coord.nx,
            ny: coord.ny
        });

        // API 요청
        const response = await axios.get('http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst', {
            params: {
                serviceKey: apiKey,
                numOfRows: 100,
                pageNo: 1,
                dataType: 'JSON',
                base_date: baseDate,
                base_time: baseTime,
                nx: coord.nx,
                ny: coord.ny
            },
            timeout: 10000 // 타임아웃 증가
        });

        // API 응답 로깅
        console.log('기상청 API 응답:', {
            resultCode: response.data?.response?.header?.resultCode,
            resultMsg: response.data?.response?.header?.resultMsg,
            itemCount: response.data?.response?.body?.items?.item?.length || 0
        });

        if (!response.data || !response.data.response || response.data.response.header.resultCode !== '00') {
            throw new Error(response.data?.response?.header?.resultMsg || 'API 응답 오류');
        }

        const items = response.data.response.body?.items?.item || [];
        console.log('받은 데이터 항목 수:', items.length);

        // 현재 시각과 가장 가까운 예보 시각의 데이터 찾기
        const currentFcstTime = kst.toISOString().slice(11, 16).replace(':', '');
        let temperature = 20;
        let sky = '맑음';
        let precipitation = '없음';

        // 데이터 파싱 개선
        const latestData = {};
        items.forEach(item => {
            const category = item.category;
            const fcstTime = item.fcstTime;
            
            if (!latestData[category] || fcstTime >= currentFcstTime) {
                latestData[category] = item.fcstValue;
            }
        });

        console.log('파싱된 최신 데이터:', latestData);

        // 온도 (TMP)
        if (latestData.TMP) {
            temperature = parseFloat(latestData.TMP);
        }

        // 하늘상태 (SKY)
        if (latestData.SKY) {
            const skyCode = latestData.SKY;
            if (skyCode === '1') sky = '맑음';
            else if (skyCode === '3') sky = '구름많음';
            else if (skyCode === '4') sky = '흐림';
        }

        // 강수형태 (PTY)
        if (latestData.PTY) {
            const ptyCode = latestData.PTY;
            if (ptyCode === '0') precipitation = '없음';
            else if (ptyCode === '1') precipitation = '비';
            else if (ptyCode === '2') precipitation = '비/눈';
            else if (ptyCode === '3') precipitation = '눈';
            else if (ptyCode === '4') precipitation = '소나기';
        }

        const weatherData = {
            region,
            temperature,
            sky,
            precipitation,
            message: '🌟 실시간 기상청 데이터',
            time: new Date().toLocaleString('ko-KR'),
            debug: {
                baseDate,
                baseTime,
                coordinates: coord,
                itemCount: items.length
            }
        };

        console.log('최종 날씨 데이터:', weatherData);

        return res.json({
            success: true,
            data: weatherData
        });

    } catch (error) {
        console.error('날씨 API 오류:', {
            message: error.message,
            code: error.code,
            response: error.response?.data
        });

        return res.json({
            success: true,
            data: {
                region: req.query.region || '서울',
                temperature: 20,
                sky: '맑음',
                precipitation: '없음',
                message: `⚠️ 오류: ${error.message}`,
                time: new Date().toLocaleString('ko-KR'),
                error: true
            }
        });
    }
};
