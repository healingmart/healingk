// api/test.js (다양한 관광 데이터 분석 확장)

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const { test = '1' } = req.query;
        
        const apiKey = process.env.TOURISM_API_KEY || process.env.TOUR_API_KEY || process.env.JEONBUK_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ success: false, message: '❌ API 키 없음' });
        }

        let result = {};

        if (test === '4') {
            // 🍽️ 음식점 데이터 분석
            const contentId = '125405'; // 음식점 예시
            const contentTypeId = '39';
            
            const commonUrl = `https://apis.data.go.kr/B551011/KorService2/detailCommon2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}`;
            const introUrl = `https://apis.data.go.kr/B551011/KorService2/detailIntro2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}&contentTypeId=${contentTypeId}`;
            
            const [commonRes, introRes] = await Promise.all([fetch(commonUrl), fetch(introUrl)]);
            const [commonData, introData] = await Promise.all([commonRes.json(), introRes.json()]);
            
            result = await analyzeRestaurantData(commonData, introData, contentId);
            
        } else if (test === '5') {
            // 🏛️ 관광지 데이터 분석  
            const contentId = '126508'; // 관광지 예시
            const contentTypeId = '12';
            
            const commonUrl = `https://apis.data.go.kr/B551011/KorService2/detailCommon2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}`;
            const introUrl = `https://apis.data.go.kr/B551011/KorService2/detailIntro2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}&contentTypeId=${contentTypeId}`;
            
            const [commonRes, introRes] = await Promise.all([fetch(commonUrl), fetch(introUrl)]);
            const [commonData, introData] = await Promise.all([commonRes.json(), introRes.json()]);
            
            result = await analyzeTouristSpotData(commonData, introData, contentId);
            
        } else if (test === '6') {
            // 🎭 축제/행사 데이터 분석
            const contentId = '128811'; // 축제 예시  
            const contentTypeId = '15';
            
            const commonUrl = `https://apis.data.go.kr/B551011/KorService2/detailCommon2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}`;
            const introUrl = `https://apis.data.go.kr/B551011/KorService2/detailIntro2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}&contentTypeId=${contentTypeId}`;
            
            const [commonRes, introRes] = await Promise.all([fetch(commonUrl), fetch(introUrl)]);
            const [commonData, introData] = await Promise.all([commonRes.json(), introRes.json()]);
            
            result = await analyzeFestivalData(commonData, introData, contentId);
            
        } else if (test === '7') {
            // 🛍️ 쇼핑 데이터 분석
            const contentId = '126449'; // 쇼핑 예시
            const contentTypeId = '38';
            
            const commonUrl = `https://apis.data.go.kr/B551011/KorService2/detailCommon2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}`;
            const introUrl = `https://apis.data.go.kr/B551011/KorService2/detailIntro2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}&contentTypeId=${contentTypeId}`;
            
            const [commonRes, introRes] = await Promise.all([fetch(commonUrl), fetch(introUrl)]);
            const [commonData, introData] = await Promise.all([commonRes.json(), introRes.json()]);
            
            result = await analyzeShoppingData(commonData, introData, contentId);
            
        } else if (test === '8') {
            // 📊 전체 데이터 통합 분석
            const testCases = [
                { contentId: '142785', contentTypeId: '32', type: '숙박' },
                { contentId: '125405', contentTypeId: '39', type: '음식점' },
                { contentId: '126508', contentTypeId: '12', type: '관광지' },
                { contentId: '128811', contentTypeId: '15', type: '축제' },
                { contentId: '126449', contentTypeId: '38', type: '쇼핑' }
            ];
            
            result = await analyzeAllTypes(apiKey, testCases);
            
        } else if (test === '3') {
            // 기존 숙박 분석 (이미 성공)
            const contentId = '142785';
            const contentTypeId = '32';
            
            const commonUrl = `https://apis.data.go.kr/B551011/KorService2/detailCommon2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}`;
            const introUrl = `https://apis.data.go.kr/B551011/KorService2/detailIntro2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}&contentTypeId=${contentTypeId}`;
            
            const [commonRes, introRes] = await Promise.all([fetch(commonUrl), fetch(introUrl)]);
            const [commonData, introData] = await Promise.all([commonRes.json(), introRes.json()]);
            
            result = await analyzeAccommodationData(commonData, introData, contentId);
        }

        return res.status(200).json({
            success: true,
            test: test,
            result: result,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
}

// 🏨 숙박 데이터 분석
async function analyzeAccommodationData(commonData, introData, contentId) {
    // ... 기존 성공한 코드
}

// 🍽️ 음식점 데이터 분석
async function analyzeRestaurantData(commonData, introData, contentId) {
    let common = null;
    let intro = null;
    
    const commonCode = commonData.resultCode || commonData.response?.header?.resultCode;
    if (commonCode === '0' || commonCode === '0000') {
        const commonItem = commonData.response?.body?.items?.item || commonData.items?.item || commonData.item;
        if (commonItem) {
            const itemData = Array.isArray(commonItem) ? commonItem[0] : commonItem;
            common = {
                overview: itemData.overview || null,
                tel: itemData.tel || null,
                homepage: itemData.homepage?.replace(/<[^>]*>/g, '') || null,
                addr1: itemData.addr1 || null,
                usetime: itemData.usetime || null,
                parking: itemData.parking || null
            };
        }
    }
    
    const introCode = introData.resultCode || introData.response?.header?.resultCode;
    if (introCode === '0' || introCode === '0000') {
        const introItem = introData.response?.body?.items?.item || introData.items?.item || introData.item;
        if (introItem) {
            const itemData = Array.isArray(introItem) ? introItem[0] : introItem;
            intro = {
                treatMenu: itemData.treatmenu || null,
                openTime: itemData.opentimefood || null,
                restDate: itemData.restdatefood || null,
                firstMenu: itemData.firstmenu || null,
                packing: itemData.packing || null,
                smoking: itemData.smoking || null,
                seat: itemData.seat || null
            };
        }
    }
    
    return {
        success: true,
        type: '음식점',
        contentId: contentId,
        common: common,
        intro: intro,
        analysis: {
            hasMenu: !!intro?.treatMenu,
            hasOpenTime: !!intro?.openTime,
            hasContact: !!common?.tel,
            completeness: calculateCompleteness(common, intro, 'restaurant')
        }
    };
}

// 완성도 계산 함수
function calculateCompleteness(common, intro, type) {
    let score = 20;
    
    if (common?.overview) score += 30;
    if (common?.tel) score += 10;
    if (common?.homepage) score += 10;
    if (common?.usetime) score += 10;
    
    if (type === 'restaurant') {
        if (intro?.treatMenu) score += 15;
        if (intro?.openTime) score += 5;
    } else if (type === 'tourist') {
        if (intro?.expguide) score += 15;
        if (intro?.useseason) score += 5;
    }
    
    return Math.min(score, 100);
}

