// api/test.js (수정된 버전)

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
            
        } else if (test === '4') {
            // 🍽️ 음식점 (실제 음식점 contentId 사용)
            result = await analyzeData(apiKey, '264302', '39', '음식점');
            
        } else if (test === '5') {
            // 🏛️ 관광지  
            result = await analyzeData(apiKey, '126508', '12', '관광지');
            
        } else if (test === '6') {
            // 🎭 축제/행사
            result = await analyzeData(apiKey, '2808074', '15', '축제');
            
        } else if (test === '7') {
            // 🛍️ 쇼핑
            result = await analyzeData(apiKey, '126449', '38', '쇼핑');
            
        } else if (test === '8') {
            // 🎨 문화시설
            result = await analyzeData(apiKey, '126487', '14', '문화시설');
            
        } else if (test === '9') {
            // 🚴 레포츠
            result = await analyzeData(apiKey, '1052339', '28', '레포츠');
            
        } else if (test === '10') {
            // 📊 모든 타입 통합 분석
            const types = [
                { contentId: '142785', contentTypeId: '32', name: '숙박' },
                { contentId: '264302', contentTypeId: '39', name: '음식점' },
                { contentId: '126508', contentTypeId: '12', name: '관광지' },
                { contentId: '2808074', contentTypeId: '15', name: '축제' },
                { contentId: '126449', contentTypeId: '38', name: '쇼핑' },
                { contentId: '126487', contentTypeId: '14', name: '문화시설' },
                { contentId: '1052339', contentTypeId: '28', name: '레포츠' }
            ];
            
            result = await analyzeAllTypes(apiKey, types);
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

// 통합 데이터 분석 함수
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
                    overview: itemData.overview?.substring(0, 100) + '...' || null,
                    tel: itemData.tel || null,
                    homepage: itemData.homepage?.replace(/<[^>]*>/g, '') || null,
                    addr1: itemData.addr1 || null,
                    usetime: itemData.usetime || null,
                    parking: itemData.parking || null,
                    firstimage: itemData.firstimage || null
                };
            }
        }
        
        // DetailIntro 처리
        const introCode = introData.resultCode || introData.response?.header?.resultCode;
        if (introCode === '0' || introCode === '0000') {
            const introItem = introData.response?.body?.items?.item || introData.items?.item || introData.item;
            if (introItem) {
                const itemData = Array.isArray(introItem) ? introItem[0] : introItem;
                
                // 타입별 특화 정보
                if (contentTypeId === '32') { // 숙박
                    intro = {
                        roomCount: itemData.roomcount || null,
                        checkIn: itemData.checkintime || null,
                        checkOut: itemData.checkouttime || null,
                        roomType: itemData.roomtype || null,
                        subfacility: itemData.subfacility || null
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
                        usetime: itemData.usetime || null,
                        accomcount: itemData.accomcount || null,
                        chkbabycarriage: itemData.chkbabycarriage || null,
                        chkpet: itemData.chkpet || null
                    };
                } else if (contentTypeId === '15') { // 축제
                    intro = {
                        eventStart: itemData.eventstartdate || null,
                        eventEnd: itemData.eventenddate || null,
                        eventPlace: itemData.eventplace || null,
                        program: itemData.program || null,
                        agelimit: itemData.agelimit || null,
                        sponsor1: itemData.sponsor1 || null
                    };
                } else if (contentTypeId === '38') { // 쇼핑
                    intro = {
                        saleItem: itemData.saleitem || null,
                        openTime: itemData.opentime || null,
                        restDate: itemData.restdateshopping || null,
                        parkingShopping: itemData.parkingshopping || null,
                        fairday: itemData.fairday || null
                    };
                } else if (contentTypeId === '14') { // 문화시설
                    intro = {
                        scale: itemData.scale || null,
                        usefee: itemData.usefee || null,
                        usetime: itemData.usetime || null,
                        restdate: itemData.restdate || null,
                        spendtime: itemData.spendtime || null
                    };
                } else if (contentTypeId === '28') { // 레포츠
                    intro = {
                        usefeeleports: itemData.usefeeleports || null,
                        usetimeleports: itemData.usetimeleports || null,
                        restdateleports: itemData.restdateleports || null,
                        reservation: itemData.reservation || null,
                        expagerangeleports: itemData.expagerangeleports || null
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
                hasOperatingTime: !!(common?.usetime || intro?.openTime || intro?.usetimeleports),
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

// 전체 타입 통합 분석
async function analyzeAllTypes(apiKey, types) {
    const results = {};
    
    for (const type of types) {
        const result = await analyzeData(apiKey, type.contentId, type.contentTypeId, type.name);
        results[type.name] = result;
        
        // API 호출 간격 (과부하 방지)
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return {
        success: true,
        totalTypes: types.length,
        results: results,
        summary: {
            successful: Object.values(results).filter(r => r.success).length,
            avgCompleteness: Object.values(results)
                .filter(r => r.success)
                .reduce((sum, r) => sum + r.analysis.completeness, 0) / types.length
        }
    };
}
