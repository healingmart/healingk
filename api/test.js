// 상세 정보 수집 함수 수정
async function getDetailedAttractionInfo(apiKey, basicAttraction, detailLevel) {
    const contentId = basicAttraction.id;
    
    // 카테고리별 정확한 ContentTypeId 사용
    let contentTypeId = 12; // 기본값
    if (basicAttraction.category.includes('B02010') || basicAttraction.category.includes('B02011')) {
        contentTypeId = 32; // 숙박시설
    }
    
    console.log(`🔍 [${basicAttraction.title}] 상세 정보 수집`);
    console.log(`  ContentID: ${contentId}, ContentTypeID: ${contentTypeId}`);
    
    try {
        // DetailCommon API 호출 - 간소화된 파라미터
        const commonParams = new URLSearchParams({
            serviceKey: apiKey,
            MobileOS: 'ETC',
            MobileApp: 'HealingK',
            _type: 'json',
            contentId: contentId,
            contentTypeId: contentTypeId.toString(),
            defaultYN: 'Y',
            overviewYN: 'Y'
        });
        
        const commonUrl = `${API_ENDPOINTS.service2.detailCommon}?${commonParams.toString()}`;
        console.log(`📡 DetailCommon URL: ${commonUrl}`);
        
        const response = await fetchWithTimeout(commonUrl, 10000);
        console.log(`📊 DetailCommon 응답: ${response.status}`);
        
        if (response.ok) {
            const data = await response.json();
            console.log(`📦 DetailCommon 원본:`, JSON.stringify(data).substring(0, 300));
            
            if (data.response?.header?.resultCode === '0000') {
                const item = data.response.body?.items?.item;
                if (item) {
                    const itemData = Array.isArray(item) ? item[0] : item;
                    console.log(`✅ 상세 정보 성공 - 개요: ${itemData.overview ? '있음' : '없음'}`);
                    
                    return {
                        ...basicAttraction,
                        overview: itemData.overview || null,
                        tel: itemData.tel || basicAttraction.tel,
                        homepage: itemData.homepage || null,
                        useInfo: {
                            useTime: itemData.usetime || null,
                            restDate: itemData.restdate || null,
                            useFee: itemData.usefee || null,
                            parking: itemData.parking || null
                        },
                        // ... 나머지
                        dataQuality: {
                            hasOverview: !!itemData.overview,
                            hasUseInfo: !!(itemData.usetime || itemData.usefee),
                            completeness: itemData.overview ? 80 : 30
                        }
                    };
                }
            } else {
                console.log(`❌ API 오류: ${data.response?.header?.resultCode} - ${data.response?.header?.resultMsg}`);
            }
        }
        
        return basicAttraction; // 실패시 기본 정보 반환
        
    } catch (error) {
        console.error(`❌ 상세 정보 수집 실패:`, error.message);
        return basicAttraction;
    }
}
