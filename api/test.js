// api/test.js (실제 데이터로 상세 분석)

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

        if (test === '15') {
            // 🍽️ 실제 음식점 상세 분석 (찾은 데이터 사용)
            result = await analyzeData(apiKey, '2871024', '39', '음식점');
            
        } else if (test === '16') {
            // 🍽️ 다른 음식점도 테스트
            result = await analyzeData(apiKey, '2869760', '39', '음식점');
            
        } else if (test === '17') {
            // 🏛️ 관광지 데이터 찾기 + 분석
            const searchUrl = `https://apis.data.go.kr/B551011/KorService2/areaBasedList2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentTypeId=12&areaCode=1&numOfRows=3`;
            
            const searchResponse = await fetch(searchUrl);
            const searchData = await searchResponse.json();
            
            let touristList = [];
            const searchCode = searchData.resultCode || searchData.response?.header?.resultCode;
            
            if (searchCode === '0' || searchCode === '0000') {
                const items = searchData.response?.body?.items?.item || [];
                const itemList = Array.isArray(items) ? items : [items];
                
                if (itemList.length > 0) {
                    const firstTourist = itemList[0];
                    const detailResult = await analyzeData(apiKey, firstTourist.contentid, '12', '관광지');
                    
                    touristList = itemList.map(item => ({
                        contentId: item.contentid,
                        title: item.title,
                        addr1: item.addr1,
                        tel: item.tel || 'N/A'
                    }));
                    
                    result = {
                        success: true,
                        type: '실제 관광지 분석',
                        touristList: touristList,
                        detailAnalysis: detailResult
                    };
                }
            }
            
        } else if (test === '18') {
            // 🎭 축제 데이터 찾기 + 분석
            const searchUrl = `https://apis.data.go.kr/B551011/KorService2/areaBasedList2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentTypeId=15&areaCode=1&numOfRows=3`;
            
            const searchResponse = await fetch(searchUrl);
            const searchData = await searchResponse.json();
            
            const searchCode = searchData.resultCode || searchData.response?.header?.resultCode;
            
            if (searchCode === '0' || searchCode === '0000') {
                const items = searchData.response?.body?.items?.item || [];
                const itemList = Array.isArray(items) ? items : [items];
                
                if (itemList.length > 0) {
                    const firstFestival = itemList[0];
                    const detailResult = await analyzeData(apiKey, firstFestival.contentid, '15', '축제');
                    
                    result = {
                        success: true,
                        type: '실제 축제 분석',
                        festivalList: itemList.map(item => ({
                            contentId: item.contentid,
                            title: item.title,
                            addr1: item.addr1
                        })),
                        detailAnalysis: detailResult
                    };
                }
            }
            
        } else if (test === '19') {
            // 📊 모든 타입 통합 분석 (실제 데이터)
            const analyses = await Promise.all([
                analyzeData(apiKey, '142785', '32', '숙박'),      // 이미 성공
                analyzeData(apiKey, '2871024', '39', '음식점'),   // 실제 발견
                analyzeData(apiKey, '126508', '12', '관광지'),    // 테스트 필요
                analyzeData(apiKey, '126449', '38', '쇼핑')       // 테스트 필요
            ]);
            
            result = {
                success: true,
                type: '전체 통합 분석',
                analyses: analyses,
                summary: {
                    successful: analyses.filter(a => a.success).length,
                    avgCompleteness: analyses
                        .filter(a => a.success)
                        .reduce((sum, a) => sum + a.analysis.completeness, 0) / analyses.length
                }
            };
            
        } else if (test === '3') {
            // 기존 성공한 숙박
            result = await analyzeData(apiKey, '142785', '32', '숙박');
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

// 상세 분석 함수
async function analyzeData(apiKey, contentId, contentTypeId, typeName) {
    try {
        const commonUrl = `https://apis.data.go.kr/B551011/KorService2/detailCommon2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}`;
        const introUrl = `https://apis.data.go.kr/B551011/KorService2/detailIntro2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}&contentTypeId=${contentTypeId}`;
        
        const [commonRes, introRes] = await Promise.all([fetch(commonUrl), fetch(introUrl)]);
        const [commonData, introData] = await Promise.all([commonRes.json(), introRes.json()]);
        
        let common = null;
        let intro = null;
        
        // DetailCommon 처리
        const commonCode = commonData.resultCode || commonData.response?.header?.resultCode;
        if (commonCode === '0' || commonCode === '0000') {
            const commonItem = commonData.response?.body?.items?.item || commonData.items?.item || commonData.item;
            if (commonItem) {
                const itemData = Array.isArray(commonItem) ? commonItem[0] : commonItem;
                common = {
                    title: itemData.title || null,
                    overview: itemData.overview?.substring(0, 150) + '...' || null,
                    tel: itemData.tel || null,
                    homepage: itemData.homepage?.replace(/<[^>]*>/g, '') || null,
                    addr1: itemData.addr1 || null,
                    usetime: itemData.usetime || null,
                    parking: itemData.parking || null,
                    usefee: itemData.usefee || null
                };
            }
        }
        
        // DetailIntro 처리
        const introCode = introData.resultCode || introData.response?.header?.resultCode;
        if (introCode === '0' || introCode === '0000') {
            const introItem = introData.response?.body?.items?.item || introData.items?.item || introData.item;
            if (introItem) {
                const itemData = Array.isArray(introItem) ? introItem[0] : introItem;
                
                if (contentTypeId === '32') { // 숙박
                    intro = {
                        roomCount: itemData.roomcount || null,
                        checkIn: itemData.checkintime || null,
                        checkOut: itemData.checkouttime || null,
                        roomType: itemData.roomtype || null
                    };
                } else if (contentTypeId === '39') { // 음식점
                    intro = {
                        treatMenu: itemData.treatmenu || null,
                        openTime: itemData.opentimefood || null,
                        restDate: itemData.restdatefood || null,
                        firstMenu: itemData.firstmenu || null,
                        smoking: itemData.smoking || null,
                        packing: itemData.packing || null,
                        seat: itemData.seat || null
                    };
                } else if (contentTypeId === '12') { // 관광지
                    intro = {
                        expguide: itemData.expguide || null,
                        heritage1: itemData.heritage1 || null,
                        useseason: itemData.useseason || null,
                        accomcount: itemData.accomcount || null
                    };
                } else if (contentTypeId === '15') { // 축제
                    intro = {
                        eventStart: itemData.eventstartdate || null,
                        eventEnd: itemData.eventenddate || null,
                        eventPlace: itemData.eventplace || null,
                        program: itemData.program || null
                    };
                }
            }
        }
        
        // 완성도 계산
        let completeness = 20;
        if (common?.overview) completeness += 30;
        if (common?.tel) completeness += 10;
        if (common?.homepage) completeness += 10;
        if (common?.usetime) completeness += 10;
        if (intro && Object.values(intro).some(v => v !== null)) completeness += 20;
        
        return {
            success: true,
            type: typeName,
            contentId: contentId,
            contentTypeId: contentTypeId,
            common: common,
            intro: intro,
            analysis: {
                hasDetailInfo: intro !== null,
                hasContact: !!common?.tel,
                hasOperatingTime: !!(common?.usetime || intro?.openTime),
                completeness: Math.min(completeness, 100)
            }
        };
        
    } catch (error) {
        return {
            success: false,
            type: typeName,
            error: error.message
        };
    }
}
