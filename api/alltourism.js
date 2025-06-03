// api/alltourism.js (CommonJS 버전)

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const { 
            keyword = '', 
            contentTypeId = '', 
            areaCode = '', 
            numOfRows = '10',
            pageNo = '1',
            detailed = 'true' 
        } = req.query;
        
        const apiKey = process.env.TOURISM_API_KEY || process.env.TOUR_API_KEY || process.env.JEONBUK_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ 
                success: false, 
                message: 'API 키가 설정되지 않았습니다' 
            });
        }

        let searchUrl;
        
        // 검색 방식 결정
        if (keyword) {
            // 키워드 검색
            searchUrl = `https://apis.data.go.kr/B551011/KorService2/searchKeyword2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&keyword=${encodeURIComponent(keyword)}&numOfRows=${numOfRows}&pageNo=${pageNo}`;
            if (contentTypeId) searchUrl += `&contentTypeId=${contentTypeId}`;
            if (areaCode) searchUrl += `&areaCode=${areaCode}`;
        } else {
            // 지역별 검색
            searchUrl = `https://apis.data.go.kr/B551011/KorService2/areaBasedList2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&numOfRows=${numOfRows}&pageNo=${pageNo}`;
            if (contentTypeId) searchUrl += `&contentTypeId=${contentTypeId}`;
            if (areaCode) searchUrl += `&areaCode=${areaCode}`;
        }

        // 기본 검색 실행
        const response = await fetch(searchUrl);
        const data = await response.json();
        
        const resultCode = data.resultCode || data.response?.header?.resultCode;
        
        if (resultCode !== '0' && resultCode !== '0000') {
            return res.status(400).json({
                success: false,
                message: '데이터 조회 실패',
                error: data.response?.header?.resultMsg || '알 수 없는 오류',
                resultCode: resultCode
            });
        }

        const items = data.response?.body?.items?.item || [];
        const itemList = Array.isArray(items) ? items : [items];
        
        if (itemList.length === 0) {
            return res.status(200).json({
                success: true,
                data: {
                    items: [],
                    totalCount: 0,
                    pageNo: parseInt(pageNo),
                    numOfRows: parseInt(numOfRows)
                },
                message: '검색 결과가 없습니다'
            });
        }

        // 기본 정보 매핑
        let tourismData = itemList.map(item => ({
            contentId: item.contentid,
            contentTypeId: item.contenttypeid,
            title: item.title,
            addr1: item.addr1,
            addr2: item.addr2 || null,
            tel: item.tel || null,
            firstimage: item.firstimage || null,
            firstimage2: item.firstimage2 || null,
            mapx: item.mapx || null,
            mapy: item.mapy || null,
            mlevel: item.mlevel || null,
            areacode: item.areacode || null,
            sigungucode: item.sigungucode || null,
            cat1: item.cat1 || null,
            cat2: item.cat2 || null,
            cat3: item.cat3 || null,
            readcount: item.readcount || null,
            modifiedtime: item.modifiedtime || null
        }));

        // 상세 정보 추가 (detailed=true인 경우)
        if (detailed === 'true' && tourismData.length > 0) {
            // 성능을 위해 상위 5개만 상세 정보 수집
            const detailedItems = tourismData.slice(0, Math.min(5, tourismData.length));
            
            const detailedPromises = detailedItems.map(async (item) => {
                try {
                    const detailInfo = await getDetailedInfo(apiKey, item.contentId, item.contentTypeId);
                    return {
                        ...item,
                        detailed: detailInfo
                    };
                } catch (error) {
                    return {
                        ...item,
                        detailed: { 
                            error: error.message, 
                            completeness: 20,
                            hasError: true
                        }
                    };
                }
            });
            
            const detailedResults = await Promise.all(detailedPromises);
            
            // 상세 정보가 포함된 항목들과 기본 정보만 있는 나머지 항목들 합치기
            tourismData = [...detailedResults, ...tourismData.slice(detailedItems.length)];
        }

        // 타입 이름 매핑
        const getTypeName = (contentTypeId) => {
            const typeMap = {
                '12': '관광지',
                '14': '문화시설', 
                '15': '축제/공연/행사',
                '25': '여행코스',
                '28': '레포츠',
                '32': '숙박',
                '38': '쇼핑',
                '39': '음식점'
            };
            return typeMap[contentTypeId] || '기타';
        };

        // 응답 데이터 구성
        const responseData = {
            items: tourismData.map(item => ({
                ...item,
                typeName: getTypeName(item.contentTypeId)
            })),
            totalCount: data.response?.body?.totalCount || tourismData.length,
            pageNo: parseInt(pageNo),
            numOfRows: parseInt(numOfRows),
            hasNext: (parseInt(pageNo) * parseInt(numOfRows)) < (data.response?.body?.totalCount || tourismData.length)
        };

        // 상세 정보 통계 (detailed=true인 경우)
        if (detailed === 'true') {
            const detailedItems = tourismData.filter(item => item.detailed);
            const successfulDetails = detailedItems.filter(item => !item.detailed?.hasError);
            
            responseData.detailStats = {
                totalItems: tourismData.length,
                detailedItems: detailedItems.length,
                successfulDetails: successfulDetails.length,
                avgCompleteness: successfulDetails.length > 0 
                    ? Math.round(successfulDetails.reduce((sum, item) => sum + item.detailed.completeness, 0) / successfulDetails.length)
                    : 0
            };
        }

        return res.status(200).json({
            success: true,
            data: responseData,
            searchParams: {
                keyword: keyword || null,
                contentTypeId: contentTypeId || null,
                areaCode: areaCode || null,
                detailed: detailed === 'true'
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('관광 정보 API 오류:', error);
        return res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
};

// 성공 공식이 적용된 상세 정보 수집 함수
async function getDetailedInfo(apiKey, contentId, contentTypeId) {
    try {
        const commonUrl = `https://apis.data.go.kr/B551011/KorService2/detailCommon2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}`;
        const introUrl = `https://apis.data.go.kr/B551011/KorService2/detailIntro2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}&contentTypeId=${contentTypeId}`;
        
        // 병렬 호출 (test.js에서 검증된 성공 공식)
        const [commonRes, introRes] = await Promise.all([fetch(commonUrl), fetch(introUrl)]);
        const [commonData, introData] = await Promise.all([commonRes.json(), introRes.json()]);
        
        let detailed = { 
            completeness: 20,
            hasError: false,
            type: getContentTypeName(contentTypeId)
        };
        
        // DetailCommon 처리
        const commonCode = commonData.resultCode || commonData.response?.header?.resultCode;
        if (commonCode === '0' || commonCode === '0000') {
            const commonItem = commonData.response?.body?.items?.item || commonData.items?.item || commonData.item;
            if (commonItem) {
                const itemData = Array.isArray(commonItem) ? commonItem[0] : commonItem;
                detailed.common = {
                    overview: itemData.overview || null,
                    tel: itemData.tel || null,
                    homepage: itemData.homepage?.replace(/<[^>]*>/g, '') || null,
                    usetime: itemData.usetime || null,
                    parking: itemData.parking || null,
                    usefee: itemData.usefee || null,
                    restdate: itemData.restdate || null,
                    infocenter: itemData.infocenter || null
                };
                
                // 완성도 계산
                if (detailed.common.overview) detailed.completeness += 30;
                if (detailed.common.tel) detailed.completeness += 10;
                if (detailed.common.homepage) detailed.completeness += 10;
                if (detailed.common.usetime) detailed.completeness += 10;
                if (detailed.common.parking) detailed.completeness += 5;
                if (detailed.common.usefee) detailed.completeness += 5;
            }
        }
        
        // DetailIntro 처리 (타입별 특화 - test.js에서 검증됨)
        const introCode = introData.resultCode || introData.response?.header?.resultCode;
        if (introCode === '0' || introCode === '0000') {
            const introItem = introData.response?.body?.items?.item || introData.items?.item || introData.item;
            if (introItem) {
                const itemData = Array.isArray(introItem) ? introItem[0] : introItem;
                
                if (contentTypeId === '32') { // 숙박
                    detailed.intro = {
                        roomCount: itemData.roomcount || null,
                        checkIn: itemData.checkintime || null,
                        checkOut: itemData.checkouttime || null,
                        roomType: itemData.roomtype || null,
                        accomount: itemData.accomount || null,
                        subfacility: itemData.subfacility || null
                    };
                    if (detailed.intro.roomCount) detailed.completeness += 10;
                    if (detailed.intro.checkIn) detailed.completeness += 5;
                    if (detailed.intro.roomType) detailed.completeness += 5;
                    
                } else if (contentTypeId === '39') { // 음식점
                    detailed.intro = {
                        treatMenu: itemData.treatmenu || null,
                        openTime: itemData.opentimefood || null,
                        restDate: itemData.restdatefood || null,
                        firstMenu: itemData.firstmenu || null,
                        smoking: itemData.smoking || null,
                        packing: itemData.packing || null,
                        seat: itemData.seat || null
                    };
                    if (detailed.intro.treatMenu) detailed.completeness += 15;
                    if (detailed.intro.openTime) detailed.completeness += 5;
                    
                } else if (contentTypeId === '12') { // 관광지
                    detailed.intro = {
                        expguide: itemData.expguide || null,
                        heritage1: itemData.heritage1 || null,
                        heritage2: itemData.heritage2 || null,
                        heritage3: itemData.heritage3 || null,
                        useseason: itemData.useseason || null,
                        accomcount: itemData.accomcount || null,
                        chkbabycarriage: itemData.chkbabycarriage || null,
                        chkpet: itemData.chkpet || null
                    };
                    if (detailed.intro.expguide) detailed.completeness += 10;
                    if (detailed.intro.heritage1 && detailed.intro.heritage1 !== '0') detailed.completeness += 10;
                    
                } else if (contentTypeId === '15') { // 축제
                    detailed.intro = {
                        eventStart: itemData.eventstartdate || null,
                        eventEnd: itemData.eventenddate || null,
                        eventPlace: itemData.eventplace || null,
                        program: itemData.program || null,
                        agelimit: itemData.agelimit || null,
                        sponsor1: itemData.sponsor1 || null,
                        sponsor1tel: itemData.sponsor1tel || null
                    };
                    if (detailed.intro.eventStart) detailed.completeness += 10;
                    if (detailed.intro.eventPlace) detailed.completeness += 5;
                    if (detailed.intro.program) detailed.completeness += 5;
                    
                } else if (contentTypeId === '38') { // 쇼핑
                    detailed.intro = {
                        saleItem: itemData.saleitem || null,
                        openTime: itemData.opentime || null,
                        restDate: itemData.restdateshopping || null,
                        parkingShopping: itemData.parkingshopping || null,
                        fairday: itemData.fairday || null,
                        shopguide: itemData.shopguide || null
                    };
                    if (detailed.intro.saleItem) detailed.completeness += 10;
                    if (detailed.intro.openTime) detailed.completeness += 5;
                    
                } else if (contentTypeId === '14') { // 문화시설
                    detailed.intro = {
                        scale: itemData.scale || null,
                        usefee: itemData.usefee || null,
                        usetime: itemData.usetime || null,
                        restdate: itemData.restdate || null,
                        spendtime: itemData.spendtime || null,
                        chkbabycarriage: itemData.chkbabycarriage || null,
                        chkpet: itemData.chkpet || null
                    };
                    if (detailed.intro.scale) detailed.completeness += 10;
                    if (detailed.intro.usefee) detailed.completeness += 5;
                    
                } else if (contentTypeId === '28') { // 레포츠
                    detailed.intro = {
                        usefeeleports: itemData.usefeeleports || null,
                        usetimeleports: itemData.usetimeleports || null,
                        restdateleports: itemData.restdateleports || null,
                        reservation: itemData.reservation || null,
                        expagerangeleports: itemData.expagerangeleports || null,
                        accomcountleports: itemData.accomcountleports || null
                    };
                    if (detailed.intro.usefeeleports) detailed.completeness += 10;
                    if (detailed.intro.usetimeleports) detailed.completeness += 5;
                    if (detailed.intro.reservation) detailed.completeness += 5;
                    
                } else if (contentTypeId === '25') { // 여행코스
                    detailed.intro = {
                        distance: itemData.distance || null,
                        schedule: itemData.schedule || null,
                        taketime: itemData.taketime || null,
                        theme: itemData.theme || null,
                        infocentertourcourse: itemData.infocentertourcourse || null
                    };
                    if (detailed.intro.schedule) detailed.completeness += 15;
                    if (detailed.intro.taketime) detailed.completeness += 5;
                }
            }
        }
        
        detailed.completeness = Math.min(detailed.completeness, 100);
        return detailed;
        
    } catch (error) {
        return { 
            completeness: 20, 
            hasError: true, 
            error: error.message 
        };
    }
}

// 타입 이름 반환 함수
function getContentTypeName(contentTypeId) {
    const typeMap = {
        '12': '관광지',
        '14': '문화시설',
        '15': '축제/공연/행사',
        '25': '여행코스',
        '28': '레포츠',
        '32': '숙박',
        '38': '쇼핑',
        '39': '음식점'
    };
    return typeMap[contentTypeId] || '기타';
}
