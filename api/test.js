// api/alltourism.js (완전한 세밀한 정보 버전)

// ... (기존 설정들)

// ===== 성공 공식 적용 =====
async function getCompleteDetailedInfo(apiKey, contentId, contentTypeId) {
    try {
        // 1. DetailCommon (contentTypeId 없이)
        const commonUrl = `https://apis.data.go.kr/B551011/KorService2/detailCommon2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}`;
        
        // 2. DetailIntro (contentTypeId 포함)
        const introUrl = `https://apis.data.go.kr/B551011/KorService2/detailIntro2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}&contentTypeId=${contentTypeId}`;
        
        // 3. 병렬 호출
        const [commonRes, introRes] = await Promise.all([
            fetch(commonUrl),
            fetch(introUrl)
        ]);
        
        const [commonData, introData] = await Promise.all([
            commonRes.json(),
            introRes.json()
        ]);
        
        // 4. 데이터 통합
        let detailedInfo = {};
        
        // DetailCommon 처리
        const commonCode = commonData.resultCode || commonData.response?.header?.resultCode;
        if (commonCode === '0' || commonCode === '0000') {
            const commonItem = commonData.response?.body?.items?.item || commonData.items?.item || commonData.item;
            if (commonItem) {
                const itemData = Array.isArray(commonItem) ? commonItem[0] : commonItem;
                detailedInfo.overview = itemData.overview || null;
                detailedInfo.tel = itemData.tel || null;
                detailedInfo.homepage = itemData.homepage?.replace(/<[^>]*>/g, '') || null;
                detailedInfo.usetime = itemData.usetime || null;
                detailedInfo.parking = itemData.parking || null;
                detailedInfo.usefee = itemData.usefee || null;
            }
        }
        
        // DetailIntro 처리
        const introCode = introData.resultCode || introData.response?.header?.resultCode;
        if (introCode === '0' || introCode === '0000') {
            const introItem = introData.response?.body?.items?.item || introData.items?.item || introData.item;
            if (introItem) {
                const itemData = Array.isArray(introItem) ? introItem[0] : introItem;
                
                // 카테고리별 특화 정보
                if (contentTypeId === '32') { // 숙박
                    detailedInfo.roomCount = itemData.roomcount || null;
                    detailedInfo.checkIn = itemData.checkintime || null;
                    detailedInfo.checkOut = itemData.checkouttime || null;
                    detailedInfo.roomType = itemData.roomtype || null;
                } else if (contentTypeId === '39') { // 음식점
                    detailedInfo.treatMenu = itemData.treatmenu || null;
                    detailedInfo.openTime = itemData.opentimefood || null;
                } else if (contentTypeId === '15') { // 축제
                    detailedInfo.eventStart = itemData.eventstartdate || null;
                    detailedInfo.eventEnd = itemData.eventenddate || null;
                    detailedInfo.eventPlace = itemData.eventplace || null;
                }
            }
        }
        
        // 완성도 계산
        let completeness = 20;
        if (detailedInfo.overview) completeness += 30;
        if (detailedInfo.tel) completeness += 10;
        if (detailedInfo.homepage) completeness += 15;
        if (detailedInfo.usetime) completeness += 10;
        if (detailedInfo.roomCount || detailedInfo.treatMenu || detailedInfo.eventStart) completeness += 15;
        
        detailedInfo.completeness = Math.min(completeness, 100);
        
        return detailedInfo;
        
    } catch (error) {
        console.error('세밀한 정보 수집 오류:', error);
        return { completeness: 20, error: error.message };
    }
}
