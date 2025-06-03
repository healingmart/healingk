// api/test.js (완전한 테스트 통합 버전)

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

        if (test === '3') {
            // 🏨 숙박 (이미 성공한 것)
            result = await analyzeData(apiKey, '142785', '32', '숙박');
            
        } else if (test === '13') {
            // 🔍 실제 음식점 검색
            result = await searchRealData(apiKey, '39', '음식점');
            
        } else if (test === '15') {
            // 🍽️ 음식점 상세 분석
            result = await analyzeData(apiKey, '2871024', '39', '음식점');
            
        } else if (test === '17') {
            // 🏛️ 관광지 분석
            result = await searchAndAnalyze(apiKey, '12', '관광지');
            
        } else if (test === '18') {
            // 🎭 축제 분석
            result = await searchAndAnalyze(apiKey, '15', '축제');
            
        } else if (test === '19') {
            // 📊 기본 4타입 통합 분석
            const analyses = await Promise.all([
                analyzeData(apiKey, '142785', '32', '숙박'),      // 성공 확인
                analyzeData(apiKey, '2871024', '39', '음식점'),   // 성공 확인
                analyzeData(apiKey, '2733967', '12', '관광지'),   // 성공 확인
                analyzeData(apiKey, '3113671', '15', '축제')      // 성공 확인
            ]);
            
            result = {
                success: true,
                type: '기본 4타입 통합 분석',
                analyses: analyses,
                summary: {
                    successful: analyses.filter(a => a.success).length,
                    avgCompleteness: analyses
                        .filter(a => a.success)
                        .reduce((sum, a) => sum + a.analysis.completeness, 0) / analyses.length
                }
            };
            
        } else if (test === '20') {
            // 🛍️ 쇼핑 분석
            result = await searchAndAnalyze(apiKey, '38', '쇼핑');
            
        } else if (test === '21') {
            // 🎨 문화시설 분석
            result = await searchAndAnalyze(apiKey, '14', '문화시설');
            
        } else if (test === '22') {
            // 🚴 레포츠 분석
            result = await searchAndAnalyze(apiKey, '28', '레포츠');
            
        } else if (test === '23') {
            // 🗺️ 여행코스 분석
            result = await searchAndAnalyze(apiKey, '25', '여행코스');
            
        } else if (test === '24') {
            // 🌟 최종 전체 타입 종합 분석
            const allAnalyses = await Promise.all([
                analyzeData(apiKey, '142785', '32', '숙박'),
                analyzeData(apiKey, '2871024', '39', '음식점'),
                analyzeData(apiKey, '2733967', '12', '관광지'),
                analyzeData(apiKey, '3113671', '15', '축제'),
                searchAndAnalyze(apiKey, '38', '쇼핑'),
                searchAndAnalyze(apiKey, '14', '문화시설'),
                searchAndAnalyze(apiKey, '28', '레포츠'),
                searchAndAnalyze(apiKey, '25', '여행코스')
            ]);
            
            result = {
                success: true,
                type: '최종 전체 타입 종합 분석',
                totalTypes: 8,
                analyses: allAnalyses,
                summary: {
                    successful: allAnalyses.filter(a => a.success).length,
                    failed: allAnalyses.filter(a => !a.success).length,
                    avgCompleteness: allAnalyses
                        .filter(a => a.success)
                        .reduce((sum, a) => sum + (a.analysis?.completeness || a.detailAnalysis?.analysis?.completeness || 0), 0) / allAnalyses.filter(a => a.success).length,
                    typeResults: allAnalyses.map(a => ({
                        type: a.type,
                        success: a.success,
                        completeness: a.analysis?.completeness || a.detailAnalysis?.analysis?.completeness || 0
                    }))
                }
            };
            
        } else if (test === '25') {
            // 📋 테스트 목록 및 현황
            result = {
                success: true,
                type: '테스트 현황',
                availableTests: {
                    'test=3': '🏨 숙박 분석 (성공 확인됨)',
                    'test=13': '🔍 실제 음식점 검색',
                    'test=15': '🍽️ 음식점 상세 분석 (성공 확인됨)',
                    'test=17': '🏛️ 관광지 분석 (성공 확인됨)',
                    'test=18': '🎭 축제 분석 (성공 확인됨)',
                    'test=19': '📊 기본 4타입 통합 분석',
                    'test=20': '🛍️ 쇼핑 분석',
                    'test=21': '🎨 문화시설 분석',
                    'test=22': '🚴 레포츠 분석',
                    'test=23': '🗺️ 여행코스 분석',
                    'test=24': '🌟 최종 전체 타입 종합 분석',
                    'test=25': '📋 이 테스트 현황표'
                },
                completedTests: ['3', '15', '17', '18', '19'],
                pendingTests: ['20', '21', '22', '23', '24'],
                currentProgress: '약 60% 완료'
            };
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

// 검색 후 분석 함수
async function searchAndAnalyze(apiKey, contentTypeId, typeName) {
    try {
        const searchUrl = `https://apis.data.go.kr/B551011/KorService2/areaBasedList2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentTypeId=${contentTypeId}&areaCode=1&numOfRows=3`;
        
        const searchResponse = await fetch(searchUrl);
        const searchData = await searchResponse.json();
        
        const searchCode = searchData.resultCode || searchData.response?.header?.resultCode;
        
        if (searchCode === '0' || searchCode === '0000') {
            const items = searchData.response?.body?.items?.item || [];
            const itemList = Array.isArray(items) ? items : [items];
            
            if (itemList.length > 0) {
                const firstItem = itemList[0];
                const detailResult = await analyzeData(apiKey, firstItem.contentid, contentTypeId, typeName);
                
                return {
                    success: true,
                    type: `실제 ${typeName} 분석`,
                    searchList: itemList.map(item => ({
                        contentId: item.contentid,
                        title: item.title,
                        addr1: item.addr1
                    })),
                    detailAnalysis: detailResult
                };
            }
        }
        
        return {
            success: false,
            type: typeName,
            message: '검색 결과 없음'
        };
        
    } catch (error) {
        return {
            success: false,
            type: typeName,
            error: error.message
        };
    }
}

// 실제 데이터 검색 함수
async function searchRealData(apiKey, contentTypeId, typeName) {
    try {
        const searchUrl = `https://apis.data.go.kr/B551011/KorService2/areaBasedList2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentTypeId=${contentTypeId}&areaCode=1&numOfRows=5`;
        
        const searchResponse = await fetch(searchUrl);
        const searchData = await searchResponse.json();
        
        const searchCode = searchData.resultCode || searchData.response?.header?.resultCode;
        
        if (searchCode === '0' || searchCode === '0000') {
            const items = searchData.response?.body?.items?.item || [];
            const itemList = Array.isArray(items) ? items : [items];
            
            return {
                success: true,
                type: `실제 ${typeName} 검색`,
                totalFound: itemList.length,
                itemList: itemList.map(item => ({
                    contentId: item.contentid,
                    title: item.title,
                    addr1: item.addr1,
                    tel: item.tel || 'N/A'
                })),
                searchResponse: searchData.response?.header
            };
        }
        
        return {
            success: false,
            type: typeName,
            message: '검색 실패'
        };
        
    } catch (error) {
        return {
            success: false,
            type: typeName,
            error: error.message
        };
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
                        type: '숙박',
                        roomCount: itemData.roomcount || null,
                        checkIn: itemData.checkintime || null,
                        checkOut: itemData.checkouttime || null,
                        roomType: itemData.roomtype || null
                    };
                } else if (contentTypeId === '39') { // 음식점
                    intro = {
                        type: '음식점',
                        treatMenu: itemData.treatmenu || null,
                        openTime: itemData.opentimefood || null,
                        restDate: itemData.restdatefood || null,
                        firstMenu: itemData.firstmenu || null,
                        packing: itemData.packing || null
                    };
                } else if (contentTypeId === '12') { // 관광지
                    intro = {
                        type: '관광지',
                        expguide: itemData.expguide || null,
                        heritage1: itemData.heritage1 || null,
                        useseason: itemData.useseason || null,
                        accomcount: itemData.accomcount || null
                    };
                } else if (contentTypeId === '15') { // 축제
                    intro = {
                        type: '축제',
                        eventStart: itemData.eventstartdate || null,
                        eventEnd: itemData.eventenddate || null,
                        eventPlace: itemData.eventplace || null,
                        program: itemData.program || null
                    };
                } else if (contentTypeId === '38') { // 쇼핑
                    intro = {
                        type: '쇼핑',
                        saleItem: itemData.saleitem || null,
                        openTime: itemData.opentime || null,
                        restDate: itemData.restdateshopping || null,
                        fairday: itemData.fairday || null
                    };
                } else if (contentTypeId === '14') { // 문화시설
                    intro = {
                        type: '문화시설',
                        scale: itemData.scale || null,
                        usefee: itemData.usefee || null,
                        usetime: itemData.usetime || null,
                        restdate: itemData.restdate || null
                    };
                } else if (contentTypeId === '28') { // 레포츠
                    intro = {
                        type: '레포츠',
                        usefeeleports: itemData.usefeeleports || null,
                        usetimeleports: itemData.usetimeleports || null,
                        restdateleports: itemData.restdateleports || null,
                        reservation: itemData.reservation || null
                    };
                } else if (contentTypeId === '25') { // 여행코스
                    intro = {
                        type: '여행코스',
                        distance: itemData.distance || null,
                        schedule: itemData.schedule || null,
                        taketime: itemData.taketime || null,
                        theme: itemData.theme || null
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
        if (intro && Object.values(intro).some(v => v !== null && v !== '0')) completeness += 20;
        
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
                hasOperatingTime: !!(common?.usetime || intro?.openTime || intro?.usetimeleports),
                completeness: Math.min(completeness, 100)
            }
        };
        
    } catch (error) {
        return {
            success: false,
            type: typeName,
            contentId: contentId,
            error: error.message
        };
    }
}
